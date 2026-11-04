import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { StepEditor } from './__step-editor'
export { action } from './__step-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { workflowId, stepId } = params

	const workflow = await prisma.workflow.findUnique({
		select: {
			id: true,
			tenantId: true,
			eventId: true,
		},
		where: { id: workflowId },
	})

	invariantResponse(workflow, 'Not Found', { status: 404 })

	const step = await prisma.step.findUnique({
		select: {
			id: true,
			name: true,
			action: true,
			tenantId: true,
			workflowId: true,
			roleId: true,
			order: true,
			nextStepId: true,
			isRejectionTarget: true,
			isBypassTarget: true,
			requiresAssignment: true,
			slaDurationMinutes: true,
		},
		where: { id: stepId },
	})

	invariantResponse(step, 'Not Found', { status: 404 })

	return json({ step, workflow })
}

export default function DeleteStepRoute() {
	const { step, workflow } = useLoaderData<typeof loader>()
	return (
		<StepEditor
			step={step}
			workflow={workflow}
			title="Delete Step"
			intent="delete"
		/>
	)
}
