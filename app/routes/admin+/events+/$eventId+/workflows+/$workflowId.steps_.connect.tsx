import { ActionFunctionArgs, json } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

/**
 * Checks if connecting source to target would create a cycle
 */
async function getNextStepId(stepId: string): Promise<string | null> {
	const step = await prisma.step.findUnique({
		where: { id: stepId },
		select: { nextStepId: true },
	})
	return step?.nextStepId ?? null
}

async function wouldCreateCycle(
	sourceId: string,
	targetId: string,
): Promise<boolean> {
	const visited = new Set<string>()
	let currentId: string | null = targetId

	while (currentId !== null) {
		if (currentId === sourceId) return true
		if (visited.has(currentId)) return false
		visited.add(currentId)

		currentId = await getNextStepId(currentId)
	}

	return false
}

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { workflowId } = params
	const formData = await request.formData()
	const intent = formData.get('intent') as string

	// Reset layout doesn't need sourceStepId
	if (intent === 'resetLayout') {
		await prisma.step.updateMany({
			where: { workflowId },
			data: { positionX: null, positionY: null },
		})
		return json({ success: true, action: 'layoutReset' })
	}

	// Create BYPASS step without full form (admin action)
	if (intent === 'createBypassStep') {
		const roleId = formData.get('roleId') as string
		const order = parseInt(formData.get('order') as string, 10)
		const tenantId = formData.get('tenantId') as string
		const nextStepId = formData.get('nextStepId') as string | null

		if (!roleId || isNaN(order) || !tenantId) {
			return json({ error: 'Missing required fields' }, { status: 400 })
		}

		await prisma.step.create({
			data: {
				name: 'Bypass',
				action: 'BYPASS',
				roleId,
				order,
				tenantId,
				workflowId: workflowId!,
				nextStepId: nextStepId || null,
			},
		})

		return json({ success: true, action: 'bypassStepCreated' })
	}

	// Create REJECT steps for all validator roles
	if (intent === 'createRejectSteps') {
		const tenantId = formData.get('tenantId') as string
		const baseOrder = parseInt(formData.get('order') as string, 10)
		const rejectionTargetId = formData.get('rejectionTargetId') as string | null

		if (!tenantId || isNaN(baseOrder)) {
			return json({ error: 'Missing required fields' }, { status: 400 })
		}

		// Find event-scoped roles (validator, reviewer, focal)
		const roles = await prisma.role.findMany({
			where: {
				OR: [
					{ name: 'validator' },
					{ name: 'reviewer' },
					{ name: 'focal' },
				],
			},
			select: { id: true, name: true },
		})

		if (roles.length === 0) {
			return json({ error: 'No matching roles found' }, { status: 400 })
		}

		// Create a REJECT step for each role
		await prisma.step.createMany({
			data: roles.map((role, index) => ({
				name: `Reject (${role.name})`,
				action: 'REJECT' as const,
				roleId: role.id,
				order: baseOrder + index,
				tenantId,
				workflowId: workflowId!,
				nextStepId: rejectionTargetId || null,
			})),
		})

		return json({ success: true, action: 'rejectStepsCreated', count: roles.length })
	}

	const sourceStepId = formData.get('sourceStepId') as string

	if (!sourceStepId) {
		return json({ error: 'Source step ID is required' }, { status: 400 })
	}

	if (intent === 'connect') {
		const targetStepId = formData.get('targetStepId') as string

		if (!targetStepId) {
			return json({ error: 'Target step ID is required' }, { status: 400 })
		}

		// Prevent self-reference
		if (sourceStepId === targetStepId) {
			return json(
				{ error: 'A step cannot connect to itself' },
				{ status: 400 },
			)
		}

		// Check for cycles
		const createsCycle = await wouldCreateCycle(sourceStepId, targetStepId)
		if (createsCycle) {
			return json(
				{ error: 'This connection would create a cycle in the workflow' },
				{ status: 400 },
			)
		}

		// Update the source step's nextStepId
		await prisma.step.update({
			where: { id: sourceStepId },
			data: { nextStepId: targetStepId },
		})

		return json({ success: true, action: 'connected' })
	}

	if (intent === 'disconnect') {
		// Clear the source step's nextStepId
		await prisma.step.update({
			where: { id: sourceStepId },
			data: { nextStepId: null },
		})

		return json({ success: true, action: 'disconnected' })
	}

	if (intent === 'updatePosition') {
		const positionX = parseFloat(formData.get('positionX') as string)
		const positionY = parseFloat(formData.get('positionY') as string)

		if (isNaN(positionX) || isNaN(positionY)) {
			return json({ error: 'Valid position coordinates are required' }, { status: 400 })
		}

		await prisma.step.update({
			where: { id: sourceStepId },
			data: { positionX, positionY },
		})

		return json({ success: true, action: 'positionUpdated' })
	}

	return json({ error: 'Invalid intent' }, { status: 400 })
}
