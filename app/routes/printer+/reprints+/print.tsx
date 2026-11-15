import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { BatchPrintDialog } from '~/components/batch-print'
import { requireUserWithRoles } from '~/utils/auth.server'
import { loadPrintBadges } from '~/utils/batch-print.server'
import { MAX_PER_PRINT } from '~/utils/boxes'
import { validateCSRF } from '~/utils/csrf.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { pendingReprints, recordReprint } from '~/utils/reprints.server'
import { redirectWithToast } from '~/utils/toast.server'

const BACK = '/printer/reprints'

/** Pending reprints, oldest request first. */
async function pendingInOrder() {
	const pending = await pendingReprints()
	return [...pending.entries()]
		.sort(([, a], [, b]) => a.requestedAt.getTime() - b.requestedAt.getTime())
		.map(([id]) => id)
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['printer'])
	const url = new URL(request.url)
	const baseUrl = `${url.protocol}//${url.host}`

	// ?only= reprints just the people ticked in the list, if still pending.
	const only = new Set(
		(url.searchParams.get('only') ?? '').split(',').filter(Boolean),
	)
	const pending = await pendingInOrder()
	const picked = only.size ? pending.filter(id => only.has(id)) : pending
	const run = picked.slice(0, MAX_PER_PRINT)
	const badges = await loadPrintBadges({ ids: run, baseUrl, path: 'reprints' })

	return json({
		badges,
		selection: only.size
			? { asked: only.size, notPending: only.size - picked.length }
			: null,
		left: picked.length - run.length,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	if (formData.get('intent') !== 'printed')
		return redirectWithToast(BACK, {
			type: 'message',
			title: 'Nothing reprinted',
			description: 'The reprint requests were left as they were.',
		})

	const confirmed = new Set(
		String(formData.get('ids') ?? '')
			.split(',')
			.filter(Boolean),
	)
	const people = (await pendingInOrder())
		.filter(id => confirmed.has(id))
		.slice(0, MAX_PER_PRINT)
	if (people.length === 0)
		return redirectWithToast(BACK, {
			type: 'error',
			title: 'Nothing reprinted',
			description:
				'None of these reprints were still waiting. Someone else may have printed them.',
		})

	let done = 0
	let failed = 0
	for (const [i, participantId] of people.entries()) {
		try {
			const reprint = await recordReprint({
				request,
				userId: user.id,
				participantId,
				remarks: 'batch reprint',
			})
			if (reprint.result === 'done') done++
		} catch (error) {
			console.error(
				`Batch reprint stopped at ${participantId} after ${done} reprinted:`,
				error,
			)
			failed = people.length - i
			break
		}
	}
	const skipped = confirmed.size - done - failed
	const left = (await pendingReprints()).size
	const description = [
		failed > 0 &&
			`Something went wrong saving the rest, so the last ${failed} badges of this run weren’t marked reprinted. Keep them: they’re still in the queue, and you can confirm them without printing again.`,
		skipped > 0 &&
			`${skipped} skipped because someone else had already reprinted them.`,
		left > 0 && `${left} more ${left === 1 ? 'is' : 'are'} waiting.`,
	]
		.filter(Boolean)
		.join(' ')

	return redirectWithToast(BACK, {
		type: failed ? 'error' : 'success',
		title: failed
			? `Stopped after ${done} of ${people.length}`
			: `${done} reprinted`,
		description: description || 'The reprint queue is clear.',
	})
}

export default function BatchReprintDialog() {
	const { badges, selection, left } = useLoaderData<typeof loader>()
	const notes = [
		selection &&
			selection.notPending > 0 &&
			`${selection.notPending} of those you selected ${selection.notPending === 1 ? 'was' : 'were'} already reprinted and won’t be printed again.`,
		left > 0 &&
			`This run holds the oldest ${badges.length} requests; the other ${left} wait for the next run.`,
	]
		.filter(Boolean)
		.join(' ')

	return (
		<BatchPrintDialog
			reprint
			badges={badges}
			name="Reprints"
			context={selection ? 'the people you selected' : undefined}
			notes={notes}
			stayWhere="in the reprint queue"
			empty={
				selection
					? 'None of the people you selected are still waiting for a reprint.'
					: 'No reprints are waiting.'
			}
			cancelTo={BACK}
		/>
	)
}
