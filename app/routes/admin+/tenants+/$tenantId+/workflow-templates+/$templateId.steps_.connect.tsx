import { ActionFunctionArgs, json } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { templateId } = params
	const formData = await request.formData()
	const intent = formData.get('intent') as string

	// Reset layout
	if (intent === 'resetLayout') {
		await prisma.stepTemplate.updateMany({
			where: { workflowTemplateId: templateId },
			data: { positionX: null, positionY: null },
		})
		return json({ success: true, action: 'layoutReset' })
	}

	const sourceStepId = formData.get('sourceStepId') as string

	if (intent === 'updatePosition') {
		const positionX = parseFloat(formData.get('positionX') as string)
		const positionY = parseFloat(formData.get('positionY') as string)

		if (isNaN(positionX) || isNaN(positionY)) {
			return json({ error: 'Valid position coordinates are required' }, { status: 400 })
		}

		await prisma.stepTemplate.update({
			where: { id: sourceStepId },
			data: { positionX, positionY },
		})

		return json({ success: true, action: 'positionUpdated' })
	}

	if (intent === 'connect') {
		const targetStepId = formData.get('targetStepId') as string

		if (!targetStepId) {
			return json({ error: 'Target step is required' }, { status: 400 })
		}

		// Check for self-reference
		if (sourceStepId === targetStepId) {
			return json({ error: 'A step cannot connect to itself' }, { status: 400 })
		}

		// Update the source step's nextStepId
		await prisma.stepTemplate.update({
			where: { id: sourceStepId },
			data: { nextStepId: targetStepId },
		})

		return json({ success: true, action: 'connected' })
	}

	if (intent === 'disconnect') {
		await prisma.stepTemplate.update({
			where: { id: sourceStepId },
			data: { nextStepId: null },
		})

		return json({ success: true, action: 'disconnected' })
	}

	return json({ error: 'Invalid intent' }, { status: 400 })
}
