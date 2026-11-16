import { Prisma } from '@prisma/client'
import { prisma } from '~/utils/db.server'

/**
 * Changing a workflow while participants are in it. Three operations, each
 * refusing rather than losing data:
 *
 * - moveParticipants: move everyone, or chosen participants, from one step to
 *   another,
 *   leaving a MOVE approval on each participant's history.
 * - removeStep: take a step out of the workflow. Steps that point at it are
 *   relinked to its next step. Deleted if nothing ever happened at it,
 *   otherwise retired so its approval history keeps a step to point at.
 * - restoreStep: bring a retired step back where it was, with its access
 *   grants, as far as the workflow still allows.
 */

export class StepLifecycleError extends Error {}

type TenantFilter = { tenantId?: string }

const AUTO_ACTIONS = ['REJECT', 'BYPASS'] as const
const ENTRY_STEP_NAME = 'Request Received'

async function findStep(stepId: string, tenantFilter: TenantFilter) {
	const step = await prisma.step.findFirst({
		where: { id: stepId, workflow: { event: tenantFilter } },
		select: {
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
		},
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

/** Why a step can't be removed yet, or null if it can. */
export function removeBlocker(
	step: {
		name: string
		order: number
		isRejectionTarget: boolean
		isBypassTarget: boolean
	},
	usage: Pick<StepUsage, 'participants'>,
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

	return prisma.$transaction(async tx => {
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
		if (approvals === 0) {
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
	})
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

type Db = Prisma.TransactionClient | typeof prisma
type FoundStep = Awaited<ReturnType<typeof findStep>>

/**
 * What restoring a retired step would do, without doing it. Steps that led to
 * it are relinked only if they still point where the removal pointed them, so
 * a change an admin made since is never overwritten.
 */
async function planRestore(db: Db, step: FoundStep) {
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
 * again, and the people who had access get it back. See planRestore.
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

	return prisma.$transaction(async tx => {
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
	})
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
	if (from.workflowId !== to.workflowId)
		throw new StepLifecycleError('Both steps must be in the same workflow.')
	if (to.retiredAt)
		throw new StepLifecycleError(`"${to.name}" is retired. Restore it first.`)
	if ((AUTO_ACTIONS as readonly string[]).includes(to.action))
		throw new StepLifecycleError(
			`"${to.name}" is a ${to.action.toLowerCase()} action, not a step participants wait at.`,
		)

	const remarks =
		`Moved from "${from.name}" to "${to.name}" by administrator` +
		(reason ? `: ${reason}` : '')

	return prisma.$transaction(async tx => {
		// Lock the rows so a validator acting at the same moment either finishes
		// first (and the participant is no longer here, so is skipped) or gets a
		// conflict.
		const chosen =
			participantIds === 'all'
				? Prisma.empty
				: Prisma.sql`AND id = ANY(${participantIds})`
		const rows = await tx.$queryRaw<{ id: string }[]>`
			SELECT id FROM "Participant"
			WHERE "stepId" = ${from.id}
			${chosen}
			FOR UPDATE`
		const ids = rows.map(r => r.id)
		if (ids.length === 0)
			throw new StepLifecycleError(
				participantIds === 'all'
					? `Nobody is at "${from.name}" any more.`
					: `None of the chosen participants are at "${from.name}" any more. Refresh and try again.`,
			)

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
		return {
			from,
			to,
			participantIds: ids,
			skipped:
				participantIds === 'all' ? 0 : participantIds.length - ids.length,
		}
	})
}

function plural(n: number, word: string) {
	return `${n} ${word}${n === 1 ? '' : 's'}`
}
