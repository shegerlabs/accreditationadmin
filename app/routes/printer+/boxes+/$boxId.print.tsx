import { AuditAction, AuditEntityType } from '@prisma/client'
import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { useLoaderData, useSearchParams } from '@remix-run/react'
import { BatchPrintDialog } from '~/components/batch-print'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { loadPrintBadges } from '~/utils/batch-print.server'
import { boxDialogBack, MAX_PER_PRINT, placementsForPrint } from '~/utils/boxes'
import { actionSummary, printPeople, readyInBox } from '~/utils/boxes.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

function backTo(boxId: string, part: string | null) {
	const sp = new URLSearchParams({ box: boxId })
	if (part) sp.set('part', part)
	return `/printer/boxes?${sp}`
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	const url = new URL(request.url)
	const baseUrl = `${url.protocol}//${url.host}`
	const partKey = url.searchParams.get('part')

	const found = await readyInBox(user.id, params.boxId ?? '', partKey)
	invariantResponse(found, 'This box isn’t in your events', { status: 404 })
	// A split box is packed per smaller box, so it's printed one at a time.
	if (found.box.splitBy && !found.part)
		return redirectWithToast(backTo(found.box.id, null), {
			type: 'message',
			title: 'Pick a smaller box',
			description: 'This box is split; print each smaller box on its own.',
		})

	// ?only= prints just the people ticked in the box, if still ready.
	const only = new Set(
		(url.searchParams.get('only') ?? '').split(',').filter(Boolean),
	)
	const picked = only.size
		? found.ready.filter(p => only.has(p.id))
		: found.ready
	const ready = picked.slice(0, MAX_PER_PRINT)
	const badges = await loadPrintBadges({
		ids: ready.map(p => p.id),
		baseUrl,
	})

	return json({
		boxId: found.box.id,
		name: found.part
			? `${found.box.name} › ${found.part.label}`
			: found.box.name,
		partKey: found.part?.key ?? null,
		badges,
		selection: only.size
			? { asked: only.size, notReady: only.size - picked.length }
			: null,
		waiting: found.waiting,
		left: picked.length - ready.length,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const partKey = String(formData.get('part') ?? '') || null
	const boxId = params.boxId ?? ''
	if (formData.get('intent') !== 'printed')
		return redirectWithToast(backTo(boxId, partKey), {
			type: 'message',
			title: 'Nothing printed',
			description: 'The box was left as it was.',
		})

	const found = await readyInBox(user.id, boxId, partKey)
	invariantResponse(found, 'This box isn’t in your events', { status: 404 })
	// A split box is packed per smaller box, so it's printed one at a time.
	if (found.box.splitBy && !found.part)
		return redirectWithToast(backTo(found.box.id, null), {
			type: 'message',
			title: 'Pick a smaller box',
			description: 'This box is split; print each smaller box on its own.',
		})

	const confirmed = new Set(
		String(formData.get('ids') ?? '')
			.split(',')
			.filter(Boolean),
	)
	const stillReady = found.ready.filter(p => confirmed.has(p.id))
	const people = stillReady.slice(0, MAX_PER_PRINT)
	const name = found.part
		? `${found.box.name} › ${found.part.label}`
		: found.box.name
	if (people.length === 0)
		return redirectWithToast(backTo(boxId, partKey), {
			type: 'error',
			title: 'Nothing printed',
			description:
				'Nobody in the preview was still waiting to print. Check the box again.',
		})

	const { done, skipped, failed } = await printPeople({
		request,
		userId: user.id,
		box: found.box,
		scopeName: name,
		people,
	})

	// Badges marked printed must be locked even if the run stopped early, or
	// they could drift to another box while sitting in this pile.
	let locked = true
	try {
		await lockToBox({ request, userId: user.id, found, name, done })
	} catch (error) {
		console.error(`Couldn't lock badges printed with box "${name}":`, error)
		locked = false
	}

	const summary = actionSummary({
		name,
		skipped: skipped + (confirmed.size - stillReady.length),
		left: found.ready.length - done.length - skipped,
	})
	if (failed || !locked)
		return redirectWithToast(backTo(boxId, partKey), {
			type: 'error',
			title: failed
				? `Stopped after ${done.length} of ${people.length}`
				: `${done.length} printed, not locked`,
			description: [
				failed &&
					`Something went wrong saving the rest, so the last ${failed} badges of this run weren’t marked printed. Keep them: they’ll show as ready on the next run, and you can confirm them without printing again.`,
				!locked &&
					'The printed badges couldn’t be locked to this box. Tell an admin before re-sorting the pile.',
				summary,
			]
				.filter(Boolean)
				.join(' '),
		})

	return redirectWithToast(backTo(boxId, partKey), {
		type: 'success',
		title: `${done.length} printed`,
		description: summary,
	})
}

/**
 * Lock printed badges to this box. A Size batch freezes as a whole: its
 * unprinted members are reserved (no printedAt) until they print.
 */
async function lockToBox({
	request,
	userId,
	found,
	name,
	done,
}: {
	request: Request
	userId: string
	found: NonNullable<Awaited<ReturnType<typeof readyInBox>>>
	name: string
	done: { id: string }[]
}) {
	if (done.length === 0) return
	const allParts = found.part
		? found.allParts.filter(p => p.key === found.part?.key)
		: found.allParts
	const placements = placementsForPrint(
		found.box,
		found.box.splitBy ? allParts : null,
		found.allMembers,
		new Set(done.map(p => p.id)),
		found.placements,
	)
	const now = new Date()
	const entries = Object.entries(placements)
	const fresh = entries.filter(([id]) => !found.placements[id])
	// Reserved in this box earlier, printed now.
	const upgraded = entries
		.filter(([id, p]) => p.printed && found.placements[id]?.printed === false)
		.map(([id]) => id)
	if (fresh.length || upgraded.length) {
		await prisma.$transaction([
			prisma.boxPlacement.createMany({
				data: fresh.map(([participantId, p]) => ({
					participantId,
					boxId: p.boxId,
					splitBy: p.splitBy,
					part: p.part,
					printedById: p.printed ? userId : null,
					printedAt: p.printed ? now : null,
				})),
				skipDuplicates: true,
			}),
			prisma.boxPlacement.updateMany({
				where: {
					participantId: { in: upgraded },
					boxId: found.box.id,
					printedAt: null,
				},
				data: { printedById: userId, printedAt: now },
			}),
		])
		const printed = fresh.filter(([, p]) => p.printed).length + upgraded.length
		const reserved = fresh.length - fresh.filter(([, p]) => p.printed).length
		await auditRequest({
			request,
			action: AuditAction.UPDATE,
			entityType: AuditEntityType.BOX,
			entityId: found.box.id,
			description: reserved
				? `Locked ${printed} printed badge(s) to box "${name}" and reserved ${reserved} more in the same batch`
				: `Locked ${printed} printed badge(s) to box "${name}"`,
			userId,
			tenantId: found.box.tenantId,
			metadata: {
				printedIds: [
					...fresh.filter(([, p]) => p.printed).map(([id]) => id),
					...upgraded,
				],
				reservedIds: fresh.filter(([, p]) => !p.printed).map(([id]) => id),
			},
		})
	}
}

export default function PrintBoxDialog() {
	const { boxId, name, partKey, badges, selection, waiting, left } =
		useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()
	const notes = [
		selection &&
			selection.notReady > 0 &&
			`${selection.notReady} of those you selected ${selection.notReady === 1 ? 'is' : 'are'} no longer ready and won’t be printed.`,
		!selection &&
			waiting > 0 &&
			`${waiting} more in this box ${waiting === 1 ? 'isn’t' : 'aren’t'} ready and won’t be marked.`,
		left > 0 &&
			`This run holds the first ${badges.length}; the other ${left} ready ${left === 1 ? 'badge waits' : 'badges wait'} for the next run.`,
	]
		.filter(Boolean)
		.join(' ')

	return (
		<BatchPrintDialog
			badges={badges}
			name={name}
			context={selection ? 'the people you selected' : undefined}
			notes={notes}
			stayWhere="ready in the box"
			empty={
				selection
					? 'None of the people you selected are still waiting to print.'
					: 'Nobody in this box is waiting to print.'
			}
			cancelTo={boxDialogBack(
				searchParams.get('back'),
				backTo(boxId, partKey ?? searchParams.get('part')),
			)}
			fields={partKey && <input type="hidden" name="part" value={partKey} />}
		/>
	)
}
