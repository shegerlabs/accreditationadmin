import { type Action } from '@prisma/client'
import { prisma } from '~/utils/db.server'

export type FlowStep = {
	id: string
	name: string
	action: Action
	roleName: string
}

/** How a step's role reads on a participant's page. */
export const stepRoleLabel = (roleName: string) =>
	roleName === 'reviewer' ? 'Focal Person' : roleName

/**
 * The steps a participant still has to pass after the one they are at,
 * following nextStepId through the workflow's active steps up to and
 * including the first PRINT step (or the end of the chain if there is none).
 */
export async function upcomingSteps(step: {
	workflowId: string
	nextStepId: string | null
}): Promise<FlowStep[]> {
	if (!step.nextStepId) return []
	const steps = await prisma.step.findMany({
		where: { workflowId: step.workflowId, retiredAt: null },
		select: {
			id: true,
			name: true,
			action: true,
			nextStepId: true,
			role: { select: { name: true } },
		},
	})
	const byId = new Map(steps.map(s => [s.id, s]))
	const out: FlowStep[] = []
	const seen = new Set<string>()
	let current = byId.get(step.nextStepId)
	while (current && !seen.has(current.id)) {
		seen.add(current.id)
		out.push({
			id: current.id,
			name: current.name,
			action: current.action,
			roleName: stepRoleLabel(current.role.name),
		})
		if (current.action === 'PRINT') break
		current = current.nextStepId ? byId.get(current.nextStepId) : undefined
	}
	return out
}
