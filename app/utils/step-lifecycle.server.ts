import { prisma } from '~/utils/db.server'
import {
	LIFECYCLE_STEP_SELECT,
	StepLifecycleError,
	moveParticipantsTx,
	moveRemarks,
	deleteRetiredStepTx,
	planRestore,
	removeStepTx,
	restoreStepTx,
} from '~/utils/step-lifecycle-core.server'

/**
 * Changing a workflow while participants are in it, one step at a time from
 * the admin UI. Three operations, each refusing rather than losing data:
 *
 * - moveParticipants: move everyone, or chosen participants, from one step to
 *   another,
 *   leaving a MOVE approval on each participant's history.
 * - removeStep: take a step out of the workflow. Steps that point at it are
 *   relinked to its next step. Deleted if nothing ever happened at it,
 *   otherwise retired so its approval history keeps a step to point at.
 * - restoreStep: bring a retired step back where it was, with its access
 *   grants, as far as the workflow still allows.
 * - deleteRetiredStep: delete a retired step for good, only when nothing
 *   happened at it (no approvals), so no history is lost.
 *
 * The rules live in step-lifecycle-core.server.ts, shared with
 * `npm run setup-event`'s workflow changes.
 */

export {
	StepLifecycleError,
	deleteRetiredBlocker,
	removeBlocker,
} from '~/utils/step-lifecycle-core.server'

type TenantFilter = { tenantId?: string }

async function findStep(stepId: string, tenantFilter: TenantFilter) {
	const step = await prisma.step.findFirst({
		where: { id: stepId, workflow: { event: tenantFilter } },
		select: LIFECYCLE_STEP_SELECT,
	})
	if (!step) throw new StepLifecycleError('Step not found.')
	return step
}

export async function getStepUsage(stepId: string) {
	const [byStatus, trashed, approvals, accessGrants] = await Promise.all([
		prisma.participant.groupBy({
			by: ['status'],
			where: { stepId },
			_count: { _all: true },
		}),
		prisma.participant.count({ where: { stepId, deletedAt: { not: null } } }),
		prisma.approval.count({ where: { stepId } }),
		prisma.userEventAccess.count({ where: { stepId } }),
	])
	const participants = byStatus.reduce((n, s) => n + s._count._all, 0)
	return {
		participants,
		trashed,
		byStatus: byStatus
			.map(s => ({ status: s.status, count: s._count._all }))
			.sort((a, b) => b.count - a.count),
		approvals,
		accessGrants,
	}
}

export type StepUsage = Awaited<ReturnType<typeof getStepUsage>>

export async function removeStep({
	stepId,
	tenantFilter,
}: {
	stepId: string
	tenantFilter: TenantFilter
}) {
	const step = await findStep(stepId, tenantFilter)
	if (step.retiredAt)
		throw new StepLifecycleError('This step is already retired.')
	return prisma.$transaction(tx => removeStepTx(tx, step))
}

export async function previewRestore({
	stepId,
	tenantFilter,
}: {
	stepId: string
	tenantFilter: TenantFilter
}) {
	const step = await findStep(stepId, tenantFilter)
	if (!step.retiredAt) throw new StepLifecycleError('This step is not retired.')
	const plan = await planRestore(prisma, step)
	return {
		step: { id: step.id, name: step.name },
		hasSavedPlace: plan.hasSavedPlace,
		next: plan.next?.name ?? null,
		nextStepCleared: plan.nextStepCleared,
		relink: plan.relink.map(p => p.name),
		notRelinked: plan.notRelinked.map(p => p.name),
		access: plan.grantNames,
	}
}

/**
 * Put a retired step back where it was: steps that led to it lead to it
 * again, and the people who had access get it back.
 */
export async function restoreStep({
	stepId,
	tenantFilter,
}: {
	stepId: string
	tenantFilter: TenantFilter
}) {
	const step = await findStep(stepId, tenantFilter)
	if (!step.retiredAt) throw new StepLifecycleError('This step is not retired.')
	return prisma.$transaction(tx => restoreStepTx(tx, step))
}

/** Delete a retired step with no history. See deleteRetiredBlocker. */
export async function deleteRetiredStep({
	stepId,
	tenantFilter,
}: {
	stepId: string
	tenantFilter: TenantFilter
}) {
	const step = await findStep(stepId, tenantFilter)
	return prisma.$transaction(tx => deleteRetiredStepTx(tx, step))
}

export async function moveParticipants({
	fromStepId,
	toStepId,
	participantIds,
	reason,
	userId,
	tenantFilter,
}: {
	fromStepId: string
	toStepId: string
	/** 'all' moves everyone at the step when the move runs. */
	participantIds: string[] | 'all'
	reason?: string
	userId: string
	tenantFilter: TenantFilter
}) {
	if (fromStepId === toStepId)
		throw new StepLifecycleError('Choose a different step to move them to.')
	if (participantIds.length === 0)
		throw new StepLifecycleError('Choose at least one participant to move.')

	const [from, to] = await Promise.all([
		findStep(fromStepId, tenantFilter),
		findStep(toStepId, tenantFilter),
	])

	return prisma.$transaction(async tx => {
		const ids = await moveParticipantsTx(tx, {
			from,
			to,
			participantIds,
			userId,
			remarks: moveRemarks(from.name, to.name, reason),
		})
		if (ids.length === 0)
			throw new StepLifecycleError(
				participantIds === 'all'
					? `Nobody is at "${from.name}" any more.`
					: `None of the chosen participants are at "${from.name}" any more. Refresh and try again.`,
			)
		return {
			from,
			to,
			participantIds: ids,
			skipped:
				participantIds === 'all' ? 0 : participantIds.length - ids.length,
		}
	})
}
