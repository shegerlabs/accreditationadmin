import {
	AuditAction,
	AuditEntityType,
	BoxMemberKind,
	BoxSplit,
	Prisma,
} from '@prisma/client'
import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { z } from 'zod'
import {
	AddPeopleButton,
	BoxEditorButton,
	DeleteBoxButton,
	LeftOutList,
	MemberRowActions,
	MoveBoxButtons,
} from '~/components/boxes/admin-controls'
import { BoxBrowser } from '~/components/boxes/box-browser'
import { auditRequest } from '~/utils/audit.server'
import { requireAdminAccess } from '~/utils/auth.server'
import { loadBadgeProblems } from '~/utils/batch-print.server'
import {
	isCatchAll,
	matchesRule,
	refilePlacements,
	CAPPABLE,
	capOf,
	resolveBox,
} from '~/utils/boxes'
import {
	assign,
	buildView,
	findPeople,
	loadBoxes,
	loadPeople,
	loadPlacements,
} from '~/utils/boxes.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

/**
 * The database's unique (eventId, name) is case-sensitive and the check before
 * saving is not, so two admins saving the same name at once land here.
 */
function isNameClash(error: unknown) {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === 'P2002'
	)
}

function nameClash() {
	return json(
		{ error: 'Another box in this event already has that name.' },
		{ status: 400 },
	)
}

async function requireEvent(request: Request, eventId: string | undefined) {
	const user = await requireAdminAccess(request)
	invariantResponse(eventId, 'Event ID is required')
	if (!user.isGlobalAdmin && !user.tenantId)
		throw json({ error: 'Access denied' }, { status: 403 })
	const event = await prisma.event.findFirst({
		where: {
			id: eventId,
			...(user.isGlobalAdmin ? {} : { tenantId: user.tenantId! }),
		},
		select: {
			id: true,
			tenantId: true,
			participantTypes: {
				select: { participantType: { select: { id: true, name: true } } },
			},
		},
	})
	invariantResponse(event, 'Access denied', { status: 403 })
	return { user, event }
}

/** Store the list order: positions 0, 1, 2… in the order given. */
function renumber(tx: Prisma.TransactionClient, ids: string[]) {
	return Promise.all(
		ids.map((id, position) =>
			tx.box.update({ where: { id }, data: { position } }),
		),
	)
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { event } = await requireEvent(request, params.eventId)
	const url = new URL(request.url)
	const [boxes, people, placements] = await Promise.all([
		loadBoxes({ eventId: event.id }),
		loadPeople([event.id]),
		loadPlacements([event.id]),
	])
	const types = event.participantTypes
		.map(t => t.participantType)
		.sort((a, b) => a.name.localeCompare(b.name))
	const names = new Map(types.map(t => [t.id, t.name]))
	const view = buildView({
		viewer: 'admin',
		boxes,
		people,
		placements,
		readiness: null,
		problems: await loadBadgeProblems(people),
		boxId: url.searchParams.get('box'),
		partKey: url.searchParams.get('part'),
		typeName: id => names.get(id) ?? 'Unknown type',
	})
	// Per-type head counts, so the box editor can say how many a rule matches.
	const typeCounts = types.map(t => {
		const ofType = people.filter(p => p.typeId === t.id)
		return {
			...t,
			total: ofType.length,
			closed: ofType.filter(p => p.closedSession).length,
		}
	})
	return json({ ...view, types: typeCounts })
}

const ids = z
	.union([z.string(), z.array(z.string())])
	.optional()
	.transform(v =>
		(v === undefined ? [] : Array.isArray(v) ? v : [v]).filter(Boolean),
	)

const SaveSchema = z.object({
	intent: z.literal('save'),
	id: z.string().optional(),
	name: z
		.string()
		.trim()
		.min(1, 'Give the box a name.')
		.max(100, 'Keep the name under 100 characters.'),
	hasRule: z.enum(['true', 'false']).transform(v => v === 'true'),
	participantTypeIds: ids,
	closedSessionOnly: z
		.string()
		.optional()
		.transform(v => v === 'on'),
	splitBy: z
		.string()
		.optional()
		.transform(v => (v && v in BoxSplit ? (v as BoxSplit) : null)),
	batchSize: z.coerce.number().int().min(1).max(500).default(25),
	maxPerBox: z
		.string()
		.optional()
		.transform(v => (v?.trim() ? Number(v) : null))
		.pipe(
			z
				.number({ invalid_type_error: 'Enter a whole number of people.' })
				.int('Enter a whole number of people.')
				.min(1, 'Allow at least 1 person per box.')
				.max(500, 'Keep it to 500 people per box or fewer.')
				.nullable(),
		),
})

const MemberSchema = z.object({
	intent: z.enum(['add-member', 'remove-member', 'restore', 'unlock']),
	boxId: z.string().min(1),
	participantId: z.string().min(1),
})

const MoveSchema = z.object({
	intent: z.literal('move'),
	boxId: z.string().min(1),
	direction: z.enum(['up', 'down']),
})

const DeleteSchema = z.object({
	intent: z.literal('delete'),
	boxId: z.string().min(1),
})

function formObject(formData: FormData) {
	const out: Record<string, string | string[]> = {}
	for (const key of new Set(formData.keys())) {
		const all = formData.getAll(key).map(String)
		out[key] = all.length > 1 ? all : all[0]!
	}
	return out
}

export async function action({ request, params }: ActionFunctionArgs) {
	const { user, event } = await requireEvent(request, params.eventId)
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)
	const data = formObject(formData)
	const here = new URL(request.url)
	const back = (boxId?: string, dropPart = false) => {
		const sp = new URLSearchParams(here.search)
		if (boxId) sp.set('box', boxId)
		else sp.delete('box')
		if (dropPart || boxId !== here.searchParams.get('box')) sp.delete('part')
		return `${here.pathname}${sp.size ? `?${sp}` : ''}`
	}
	const audit = (
		action: AuditAction,
		entityId: string,
		description: string,
		metadata?: object,
	) =>
		auditRequest({
			request,
			action,
			entityType: AuditEntityType.BOX,
			entityId,
			description,
			userId: user.id,
			tenantId: event.tenantId,
			metadata,
		})

	if (data.intent === 'save') {
		const parsed = SaveSchema.safeParse(data)
		if (!parsed.success)
			return json(
				{
					error:
						parsed.error.issues[0]?.message ?? 'Check the form and try again.',
				},
				{ status: 400 },
			)
		const v = parsed.data
		const allowedTypes = new Set(
			event.participantTypes.map(t => t.participantType.id),
		)
		const box = {
			name: v.name,
			hasRule: v.hasRule,
			participantTypeIds: v.hasRule
				? v.participantTypeIds.filter(id => allowedTypes.has(id))
				: [],
			closedSessionOnly: v.hasRule && v.closedSessionOnly,
			splitBy: v.splitBy,
			batchSize: v.batchSize,
			maxPerBox: v.splitBy && CAPPABLE.includes(v.splitBy) ? v.maxPerBox : null,
		}
		const clash = await prisma.box.findFirst({
			where: {
				eventId: event.id,
				name: { equals: box.name, mode: 'insensitive' },
				NOT: v.id ? { id: v.id } : undefined,
			},
			select: { id: true },
		})
		if (clash) return nameClash()

		if (v.id) {
			const boxes = await loadBoxes({ eventId: event.id })
			const existing = boxes.find(b => b.id === v.id)
			invariantResponse(existing, 'Box not found', { status: 404 })
			// A new split re-files badges locked to the box, so each sits in a
			// smaller box that exists under it.
			// Adding or dropping a cap changes how part keys are written too.
			const resplit =
				existing.splitBy !== box.splitBy ||
				(capOf(existing) === null) !== (capOf(box) === null)
			let refiled: ReturnType<typeof refilePlacements> = {}
			if (resplit) {
				const [people, placements] = await Promise.all([
					loadPeople([event.id]),
					loadPlacements([event.id]),
				])
				const next = { ...existing, ...box }
				const assignments = assign(
					boxes.map(b => (b.id === next.id ? next : b)),
					people,
					placements,
				)
				refiled = refilePlacements(
					next,
					resolveBox(next, people, assignments).members,
					placements,
				)
			}
			try {
				await prisma.$transaction([
					prisma.box.update({ where: { id: v.id }, data: box }),
					...Object.entries(refiled).map(([participantId, p]) =>
						prisma.boxPlacement.update({
							where: { participantId },
							data: { splitBy: p.splitBy, part: p.part },
						}),
					),
				])
			} catch (error) {
				if (isNameClash(error)) return nameClash()
				throw error
			}
			const moved = Object.keys(refiled).length
			await audit(AuditAction.UPDATE, v.id, `Updated box "${box.name}"`, {
				box,
				...(moved ? { refiledParticipantIds: Object.keys(refiled) } : {}),
			})
			return redirectWithToast(back(v.id, resplit), {
				type: 'success',
				title: 'Box saved',
				description: moved
					? `${box.name}. ${moved} locked ${moved === 1 ? 'badge was' : 'badges were'} re-filed under the new split.`
					: box.name,
			})
		}
		// A new box goes above the first catch-all, so it gets the people it
		// was made for instead of starting empty; otherwise at the bottom.
		const order = await loadBoxes({ eventId: event.id })
		const at = order.findIndex(isCatchAll)
		const slot = at === -1 ? order.length : at
		let created: { id: string }
		try {
			created = await prisma.$transaction(async tx => {
				const made = await tx.box.create({
					data: {
						...box,
						position: slot,
						eventId: event.id,
						tenantId: event.tenantId,
						createdById: user.id,
					},
					select: { id: true },
				})
				await renumber(tx, [
					...order.slice(0, slot).map(b => b.id),
					made.id,
					...order.slice(slot).map(b => b.id),
				])
				return made
			})
		} catch (error) {
			if (isNameClash(error)) return nameClash()
			throw error
		}
		await audit(AuditAction.CREATE, created.id, `Created box "${box.name}"`, {
			box,
		})
		return redirectWithToast(back(created.id), {
			type: 'success',
			title: 'Box created',
			description: box.name,
		})
	}

	if (data.intent === 'move') {
		const parsed = MoveSchema.safeParse(data)
		if (!parsed.success)
			return json(
				{ error: 'Something was missing from the form.' },
				{ status: 400 },
			)
		const { boxId, direction } = parsed.data
		const order = (await loadBoxes({ eventId: event.id })).map(b => b.id)
		const i = order.indexOf(boxId)
		invariantResponse(i !== -1, 'Box not found', { status: 404 })
		const j = direction === 'up' ? i - 1 : i + 1
		if (j < 0 || j >= order.length) return json({ ok: true })
		;[order[i], order[j]] = [order[j]!, order[i]!]
		await prisma.$transaction(tx => renumber(tx, order))
		await audit(AuditAction.UPDATE, boxId, `Moved box ${direction} the list`, {
			order,
		})
		return json({ ok: true })
	}

	if (data.intent === 'delete') {
		const parsed = DeleteSchema.safeParse(data)
		if (!parsed.success)
			return json(
				{ error: 'Something was missing from the form.' },
				{ status: 400 },
			)
		const box = await prisma.box.findFirst({
			where: { id: parsed.data.boxId, eventId: event.id },
			select: { id: true, name: true },
		})
		invariantResponse(box, 'Box not found', { status: 404 })
		await prisma.box.delete({ where: { id: box.id } })
		await audit(AuditAction.DELETE, box.id, `Deleted box "${box.name}"`)
		return redirectWithToast(back(), {
			type: 'success',
			title: 'Box deleted',
			description: `${box.name}. Badges printed through it are free to go in other boxes.`,
		})
	}

	const parsed = MemberSchema.safeParse(data)
	if (!parsed.success)
		return json(
			{ error: 'Something was missing from the form.' },
			{ status: 400 },
		)
	const { intent, boxId, participantId } = parsed.data
	const [box, participant] = await Promise.all([
		prisma.box.findFirst({
			where: { id: boxId, eventId: event.id },
			select: { id: true, name: true },
		}),
		prisma.participant.findFirst({
			where: { id: participantId, eventId: event.id },
			select: { id: true, firstName: true, familyName: true },
		}),
	])
	invariantResponse(box && participant, 'Not found', { status: 404 })
	const who = `${participant.firstName} ${participant.familyName}`
	const key = { boxId_participantId: { boxId, participantId } }

	if (intent === 'add-member') {
		// A printed badge stays in its pile; someone has to unlock it first.
		const placed = await prisma.boxPlacement.findUnique({
			where: { participantId },
			select: { boxId: true, box: { select: { name: true } } },
		})
		if (placed && placed.boxId !== boxId)
			return json(
				{
					error: `${who}’s badge is in "${placed.box.name}". Unlock it there first.`,
				},
				{ status: 400 },
			)
		// One box per person: a hand pick here undoes a hand pick elsewhere.
		const [moved] = await prisma.$transaction([
			prisma.boxMember.findMany({
				where: {
					participantId,
					kind: BoxMemberKind.INCLUDE,
					boxId: { not: boxId },
				},
				select: { box: { select: { name: true } } },
			}),
			prisma.boxMember.deleteMany({
				where: {
					participantId,
					kind: BoxMemberKind.INCLUDE,
					boxId: { not: boxId },
				},
			}),
			prisma.boxMember.upsert({
				where: key,
				create: { boxId, participantId, kind: BoxMemberKind.INCLUDE },
				update: { kind: BoxMemberKind.INCLUDE },
			}),
		])
		await audit(
			AuditAction.UPDATE,
			boxId,
			`Added ${who} to box "${box.name}"`,
			{ participantId, movedFrom: moved.map(m => m.box.name) },
		)
		return json({ ok: true })
	}

	if (intent === 'remove-member') {
		const membership = await prisma.boxMember.findUnique({
			where: key,
			select: { kind: true },
		})
		const handPicked = membership?.kind === BoxMemberKind.INCLUDE
		// Only someone the rule matches needs leaving out. Anyone else (in the
		// box only because their badge was printed through it) leaves once the
		// badge is unlocked; an EXCLUDE row would list them under Left out with
		// a Put back that does nothing.
		let matches = false
		if (!handPicked) {
			const [[def], [person]] = await Promise.all([
				loadBoxes({ id: boxId }),
				findPeople({ id: participantId }),
			])
			matches = Boolean(def && person && matchesRule(person, def))
		}
		await prisma.$transaction([
			matches
				? prisma.boxMember.upsert({
						where: key,
						create: { boxId, participantId, kind: BoxMemberKind.EXCLUDE },
						update: { kind: BoxMemberKind.EXCLUDE },
					})
				: prisma.boxMember.deleteMany({ where: key.boxId_participantId }),
			prisma.boxPlacement.deleteMany({ where: { participantId, boxId } }),
		])
		await audit(
			AuditAction.UPDATE,
			boxId,
			matches
				? `Left ${who} out of box "${box.name}"`
				: `Took ${who} out of box "${box.name}"`,
			{ participantId },
		)
		return redirectWithToast(back(boxId), {
			type: 'success',
			...(matches
				? {
						title: 'Left out of the box',
						description: `${who} is under Left out. Use Put back to undo.`,
					}
				: { title: 'Removed from the box', description: who }),
		})
	}

	if (intent === 'restore') {
		await prisma.boxMember.deleteMany({
			where: { boxId, participantId, kind: BoxMemberKind.EXCLUDE },
		})
		await audit(
			AuditAction.UPDATE,
			boxId,
			`Put ${who} back in box "${box.name}"`,
			{ participantId },
		)
		return redirectWithToast(back(boxId), {
			type: 'success',
			title: 'Put back',
			description: who,
		})
	}

	await prisma.boxPlacement.deleteMany({ where: { participantId, boxId } })
	await audit(
		AuditAction.UPDATE,
		boxId,
		`Unlocked ${who}'s printed badge from box "${box.name}"`,
		{
			participantId,
		},
	)
	return redirectWithToast(back(boxId), {
		type: 'success',
		title: 'Badge unlocked',
		description: `${who} now follows the box rules again.`,
	})
}

export default function EventBoxesRoute() {
	const { types, ...view } = useLoaderData<typeof loader>()
	return (
		<BoxBrowser
			view={view}
			viewer="admin"
			sidebarAction={<BoxEditorButton types={types} />}
			boxAction={(b, i) => (
				<MoveBoxButtons
					boxId={b.id}
					name={b.name}
					first={i === 0}
					last={i === view.boxes.length - 1}
				/>
			)}
			headerControls={box => (
				<div className="flex flex-wrap gap-2">
					<AddPeopleButton box={box} />
					<BoxEditorButton types={types} box={box} />
					<DeleteBoxButton box={box} />
				</div>
			)}
			memberActions={(box, m) => <MemberRowActions box={box} member={m} />}
			footer={box => <LeftOutList box={box} />}
			emptyBox={
				<>
					Nobody is in this box yet. Use Add people to pick some, or edit its
					rule.
				</>
			}
			noBoxes={
				<>
					No boxes yet. A box groups participants so printers can print their
					badges together.
				</>
			}
		/>
	)
}
