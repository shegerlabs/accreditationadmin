import { Action, AuditAction, AuditEntityType } from '@prisma/client'
import { auditRequest } from './audit.server'
import { prisma } from './db.server'

export type PendingReprint = {
	requestedAt: Date
	reason: string
	requestedBy: string
}

/**
 * Participants with a reprint waiting: their latest REPRINT request has no
 * PRINT after it. Pass `participantIds` to check just those.
 */
export async function pendingReprints(
	participantIds?: string[],
): Promise<Map<string, PendingReprint>> {
	const requests = await prisma.approval.findMany({
		where: {
			action: Action.REPRINT,
			result: 'SUCCESS',
			participant: { deletedAt: null },
			...(participantIds && { participantId: { in: participantIds } }),
		},
		select: {
			participantId: true,
			remarks: true,
			createdAt: true,
			user: { select: { name: true, username: true } },
		},
		orderBy: { createdAt: 'desc' },
	})
	const latest = new Map<string, (typeof requests)[number]>()
	for (const r of requests)
		if (!latest.has(r.participantId)) latest.set(r.participantId, r)
	if (latest.size === 0) return new Map()

	const prints = await prisma.approval.groupBy({
		by: ['participantId'],
		where: { action: Action.PRINT, participantId: { in: [...latest.keys()] } },
		_max: { createdAt: true },
	})
	const lastPrint = new Map(
		prints.map(p => [p.participantId, p._max.createdAt]),
	)

	const out = new Map<string, PendingReprint>()
	for (const [id, r] of latest) {
		const printed = lastPrint.get(id)
		if (printed && printed > r.createdAt) continue
		out.set(id, {
			requestedAt: r.createdAt,
			reason:
				r.remarks?.replace('Reprint requested: ', '') || 'No reason provided',
			requestedBy: r.user?.name || r.user?.username || 'Unknown',
		})
	}
	return out
}

/**
 * Record that a participant's badge was reprinted: bump the reprint count and
 * log a PRINT approval, which fulfils the request. Refuses if no request is
 * pending, e.g. another printer got there first.
 */
export async function recordReprint({
	request,
	userId,
	participantId,
	remarks,
}: {
	request: Request
	userId: string
	participantId: string
	/** Added to the approval and audit log, e.g. how it was printed. */
	remarks?: string
}): Promise<
	| { result: 'done'; name: string; number: number }
	| { result: 'fulfilled' | 'none' }
> {
	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		select: {
			id: true,
			firstName: true,
			familyName: true,
			email: true,
			organization: true,
			tenantId: true,
			reprintCount: true,
			step: {
				select: {
					id: true,
					workflow: {
						select: {
							id: true,
							name: true,
							event: { select: { id: true, name: true } },
						},
					},
				},
			},
			participantType: { select: { name: true } },
		},
	})
	if (!participant) return { result: 'none' }

	const hasRequest = await prisma.approval.findFirst({
		where: { participantId, action: Action.REPRINT, result: 'SUCCESS' },
		select: { id: true },
	})
	if (!hasRequest) return { result: 'none' }
	if (!(await pendingReprints([participantId])).has(participantId))
		return { result: 'fulfilled' }

	const number = participant.reprintCount + 1
	const suffix = remarks ? `, ${remarks}` : ''
	await prisma.$transaction([
		prisma.participant.update({
			where: { id: participant.id },
			data: { reprintCount: { increment: 1 } },
		}),
		prisma.approval.create({
			data: {
				participantId: participant.id,
				stepId: participant.step.id,
				userId,
				action: Action.PRINT,
				result: 'SUCCESS',
				remarks: `Badge Reprinted (reprint #${number}${suffix})`,
			},
		}),
	])

	await auditRequest({
		request,
		action: AuditAction.REPRINT,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participant.id,
		description: `Badge reprinted for ${participant.firstName} ${participant.familyName} (reprint #${number}${suffix})`,
		userId,
		tenantId: participant.tenantId,
		metadata: {
			participant: {
				id: participant.id,
				name: `${participant.firstName} ${participant.familyName}`,
				email: participant.email,
				organization: participant.organization,
				type: participant.participantType.name,
			},
			reprint: {
				reprintNumber: number,
				printedBy: userId,
				printedAt: new Date().toISOString(),
			},
			event: {
				id: participant.step.workflow.event.id,
				name: participant.step.workflow.event.name,
			},
			workflow: {
				id: participant.step.workflow.id,
				name: participant.step.workflow.name,
			},
		},
	})
	return {
		result: 'done',
		name: `${participant.firstName} ${participant.familyName}`,
		number,
	}
}
