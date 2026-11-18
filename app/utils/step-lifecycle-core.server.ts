// The rules for changing a workflow while participants are in it, as
// operations on a transaction. The admin UI (step-lifecycle.server.ts) wraps
// each in its own transaction; scripts/lib/workflow-changes.ts runs many in one.
//
// Keep this module free of Remix and `~/` imports: the CLI scripts import it.
// Decision record: docs/decisions/2026-11-16-changing-workflows-mid-event.md

import { Prisma, type Action, type RequestStatus } from '@prisma/client'

type Tx = Prisma.TransactionClient

export class StepLifecycleError extends Error {}

/** Actions a participant is sent through, never left waiting at. */
export const AUTO_ACTIONS: readonly Action[] = ['REJECT', 'BYPASS']
export const ENTRY_STEP_NAME = 'Request Received'

export const LIFECYCLE_STEP_SELECT = {
	id: true,
	name: true,
	order: true,
	action: true,
	tenantId: true,
	workflowId: true,
	nextStepId: true,
	isRejectionTarget: true,
	isBypassTarget: true,
	retiredAt: true,
} satisfies Prisma.StepSelect

export type LifecycleStep = Prisma.StepGetPayload<{
	select: typeof LIFECYCLE_STEP_SELECT
}>

/** Why a step can't be removed yet, or null if it can. */
export function removeBlocker(
	step: {
		name: string
		order: number
		isRejectionTarget: boolean
		isBypassTarget: boolean
	},
	usage: { participants: number },
) {
	// The registration app (../accreditation) puts new registrants on the
	// step with order 1 and resubmissions on "Request Received", without
	// checking retiredAt. Removing either would strand or block registrants.
	if (step.order === 1 || step.name === ENTRY_STEP_NAME)
		return 'New registrations enter the workflow at this step, so it can’t be removed.'
	if (step.isRejectionTarget)
		return 'This step is the rejection target. Mark another step as the rejection target first.'
	if (step.isBypassTarget)
		return 'This step is the bypass target. Mark another step as the bypass target first.'
	if (usage.participants > 0)
		return `${plural(usage.participants, 'participant')} ${usage.participants === 1 ? 'is' : 'are'} at this step. Move them to another step first.`
	return null
}

/**
 * Take a step out of its workflow. Steps that led to it are relinked to its
 * next step. Deleted if nothing was ever recorded there, otherwise retired
 * (kept for its history, restorable). `retire` retires it either way, so the
 * removal can be undone.
 */
export async function removeStepTx(
	tx: Tx,
	step: LifecycleStep,
	{ retire = false }: { retire?: boolean } = {},
) {
	// Lock the step itself: processParticipant checks its target step with
	// FOR SHARE before moving anyone onto it, so it waits for this
	// transaction and then sees the step retired or gone.
	await tx.$queryRaw`SELECT id FROM "Step" WHERE id = ${step.id} FOR UPDATE`
	// Lock the participants at this step (and fail if any).
	const waiting = await tx.$queryRaw<{ id: string }[]>`
		SELECT id FROM "Participant" WHERE "stepId" = ${step.id} FOR UPDATE`
	const blocker = removeBlocker(step, { participants: waiting.length })
	if (blocker) throw new StepLifecycleError(blocker)

	// Anything that led here now leads where this step led. Without this the
	// next approval would send participants to a step that no longer exists.
	const predecessors = await tx.step.findMany({
		where: { workflowId: step.workflowId, nextStepId: step.id },
		select: { id: true },
	})
	const relinked = await tx.step.updateMany({
		where: { id: { in: predecessors.map(p => p.id) } },
		data: { nextStepId: step.nextStepId },
	})

	const approvals = await tx.approval.count({ where: { stepId: step.id } })
	if (approvals === 0 && !retire) {
		await tx.step.delete({ where: { id: step.id } })
		return { outcome: 'deleted' as const, step, relinked: relinked.count }
	}

	const grants = await tx.userEventAccess.findMany({
		where: { stepId: step.id },
		select: { userId: true, eventId: true, roleId: true },
	})
	const access = await tx.userEventAccess.deleteMany({
		where: { stepId: step.id },
	})
	const links: RetiredLinks = {
		predecessorIds: predecessors.map(p => p.id),
		access: grants,
	}
	await tx.step.update({
		where: { id: step.id },
		data: {
			retiredAt: new Date(),
			retiredLinks: links,
			isRejectionTarget: false,
			isBypassTarget: false,
		},
	})
	return {
		outcome: 'retired' as const,
		step,
		relinked: relinked.count,
		approvals,
		accessRemoved: access.count,
	}
}

type RetiredLinks = {
	predecessorIds: string[]
	access: { userId: string; eventId: string; roleId: string }[]
}

function readRetiredLinks(value: Prisma.JsonValue): RetiredLinks {
	const v = (value ?? {}) as Partial<RetiredLinks>
	return {
		predecessorIds: Array.isArray(v.predecessorIds) ? v.predecessorIds : [],
		access: Array.isArray(v.access) ? v.access : [],
	}
}

/**
 * What restoring a retired step would do, without doing it. Steps that led to
 * it are relinked only if they still point where the removal pointed them, so
 * a change an admin made since is never overwritten.
 */
export async function planRestore(db: Tx, step: LifecycleStep) {
	const { retiredLinks } = await db.step.findUniqueOrThrow({
		where: { id: step.id },
		select: { retiredLinks: true },
	})
	const links = readRetiredLinks(retiredLinks)

	const [next, predecessors, users, roles] = await Promise.all([
		// Its old next step may have been retired or deleted since.
		step.nextStepId
			? db.step.findFirst({
					where: {
						id: step.nextStepId,
						workflowId: step.workflowId,
						retiredAt: null,
					},
					select: { id: true, name: true },
				})
			: null,
		db.step.findMany({
			where: { id: { in: links.predecessorIds }, workflowId: step.workflowId },
			select: { id: true, name: true, nextStepId: true, retiredAt: true },
		}),
		db.user.findMany({
			where: { id: { in: links.access.map(a => a.userId) } },
			select: { id: true, name: true, username: true },
		}),
		db.role.findMany({
			where: { id: { in: links.access.map(a => a.roleId) } },
			select: { id: true },
		}),
	])

	const relink = predecessors.filter(
		p => !p.retiredAt && p.nextStepId === step.nextStepId,
	)
	const userName = new Map(users.map(u => [u.id, u.name || u.username]))
	const roleIds = new Set(roles.map(r => r.id))
	const grants = links.access.filter(
		a => userName.has(a.userId) && roleIds.has(a.roleId),
	)

	return {
		hasSavedPlace: retiredLinks !== null,
		next: next ?? null,
		nextStepCleared: Boolean(step.nextStepId) && !next,
		relink,
		notRelinked: predecessors.filter(p => !relink.includes(p)),
		grants,
		grantNames: [...new Set(grants.map(g => userName.get(g.userId)!))],
	}
}

/** Put a retired step back where it was. See planRestore. */
export async function restoreStepTx(tx: Tx, step: LifecycleStep) {
	if (!step.retiredAt) throw new StepLifecycleError('This step is not retired.')
	const plan = await planRestore(tx, step)

	await tx.step.updateMany({
		where: { id: { in: plan.relink.map(p => p.id) } },
		data: { nextStepId: step.id },
	})
	const access = await tx.userEventAccess.createMany({
		data: plan.grants.map(a => ({ ...a, stepId: step.id })),
		skipDuplicates: true,
	})
	await tx.step.update({
		where: { id: step.id },
		data: {
			retiredAt: null,
			retiredLinks: Prisma.DbNull,
			nextStepId: plan.next?.id ?? null,
		},
	})

	return {
		step,
		relinked: plan.relink.map(p => p.name),
		notRelinked: plan.notRelinked.map(p => p.name),
		nextStepCleared: plan.nextStepCleared,
		accessRestored: access.count,
	}
}

/** Why a retired step can't be deleted for good, or null if it can. */
export function deleteRetiredBlocker(
	step: Pick<LifecycleStep, 'retiredAt'>,
	usage: { approvals: number; participants: number },
) {
	if (!step.retiredAt) return 'Only a retired step can be deleted from here.'
	if (usage.approvals > 0)
		return `${plural(usage.approvals, 'approval')} point at this step. It stays retired so that history keeps the step it happened at.`
	if (usage.participants > 0)
		return `${plural(usage.participants, 'participant')} still point at this step.`
	return null
}

/**
 * Delete a retired step that nothing points at, for good. A step with history
 * is refused: its approvals need it (and the database won't allow it either).
 */
export async function deleteRetiredStepTx(tx: Tx, step: LifecycleStep) {
	await tx.$queryRaw`SELECT id FROM "Step" WHERE id = ${step.id} FOR UPDATE`
	const current = await tx.step.findUniqueOrThrow({
		where: { id: step.id },
		select: {
			retiredAt: true,
			_count: { select: { approvals: true, participants: true } },
		},
	})
	const blocker = deleteRetiredBlocker(current, current._count)
	if (blocker) throw new StepLifecycleError(blocker)
	await tx.step.delete({ where: { id: step.id } })
	return { step }
}

/** Refuse a move the workflow can't honour. */
export function assertMoveTarget(from: LifecycleStep, to: LifecycleStep) {
	if (from.id === to.id)
		throw new StepLifecycleError('Choose a different step to move them to.')
	if (from.workflowId !== to.workflowId)
		throw new StepLifecycleError('Both steps must be in the same workflow.')
	if (to.retiredAt)
		throw new StepLifecycleError(`"${to.name}" is retired. Restore it first.`)
	if (AUTO_ACTIONS.includes(to.action))
		throw new StepLifecycleError(
			`"${to.name}" is a ${to.action.toLowerCase()} action, not a step participants wait at.`,
		)
}

/**
 * Move participants from one step to another, leaving a MOVE approval at the
 * step each one left. Status is unchanged. Returns the ids actually moved,
 * which may be none.
 */
export async function moveParticipantsTx(
	tx: Tx,
	{
		from,
		to,
		participantIds,
		statuses,
		userId,
		remarks,
	}: {
		from: LifecycleStep
		to: LifecycleStep
		/** 'all' moves everyone at the step when the move runs. */
		participantIds: string[] | 'all'
		/** Only participants with one of these statuses. Omit for any status. */
		statuses?: RequestStatus[]
		userId: string
		remarks: string
	},
) {
	assertMoveTarget(from, to)

	// Lock the rows so a validator acting at the same moment either finishes
	// first (and the participant is no longer here, so is skipped) or gets a
	// conflict.
	const chosen =
		participantIds === 'all'
			? Prisma.empty
			: Prisma.sql`AND id = ANY(${participantIds})`
	const withStatus = statuses
		? Prisma.sql`AND status::text = ANY(${statuses as string[]})`
		: Prisma.empty
	const rows = await tx.$queryRaw<{ id: string }[]>`
		SELECT id FROM "Participant"
		WHERE "stepId" = ${from.id}
		${chosen}
		${withStatus}
		FOR UPDATE`
	const ids = rows.map(r => r.id)
	if (ids.length === 0) return ids

	await tx.participant.updateMany({
		where: { id: { in: ids } },
		data: { stepId: to.id },
	})
	const now = new Date()
	await tx.approval.createMany({
		data: ids.map(
			(participantId): Prisma.ApprovalCreateManyInput => ({
				participantId,
				stepId: from.id,
				userId,
				action: 'MOVE',
				result: 'SUCCESS',
				remarks,
				createdAt: now,
			}),
		),
	})
	return ids
}

export function moveRemarks(from: string, to: string, reason?: string) {
	return (
		`Moved from "${from}" to "${to}" by administrator` +
		(reason ? `: ${reason}` : '')
	)
}

/**
 * Add a step right after another one: the new step takes over the old step's
 * next link, and the old step points at it. Participants follow nextStepId when
 * they are acted on, so those not yet past `afterStepId` will go through it.
 */
export async function insertStepAfterTx(
	tx: Tx,
	{
		afterStepId,
		step,
	}: {
		afterStepId: string
		step: {
			name: string
			action: Action
			roleId: string
			requiresAssignment: boolean
			slaDurationMinutes: number | null
		}
	},
) {
	// Lock the step being relinked, and read its link inside the lock.
	await tx.$queryRaw`SELECT id FROM "Step" WHERE id = ${afterStepId} FOR UPDATE`
	const after = await tx.step.findUniqueOrThrow({
		where: { id: afterStepId },
		select: LIFECYCLE_STEP_SELECT,
	})
	if (after.retiredAt)
		throw new StepLifecycleError(`"${after.name}" is retired.`)
	if (AUTO_ACTIONS.includes(after.action))
		throw new StepLifecycleError(
			`"${after.name}" is a ${after.action.toLowerCase()} action; nothing follows it.`,
		)

	// Order only matters for order 1, the entry step; new steps go last, as in
	// the step editor.
	const last = await tx.step.findFirst({
		where: { workflowId: after.workflowId },
		orderBy: { order: 'desc' },
		select: { order: true },
	})
	const created = await tx.step.create({
		data: {
			...step,
			order: (last?.order ?? 0) + 1,
			tenantId: after.tenantId,
			workflowId: after.workflowId,
			nextStepId: after.nextStepId,
		},
		select: LIFECYCLE_STEP_SELECT,
	})
	await tx.step.update({
		where: { id: after.id },
		data: { nextStepId: created.id },
	})
	return { after, created }
}

export function plural(n: number, word: string) {
	return `${n} ${word}${n === 1 ? '' : 's'}`
}
