import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { StepEditor } from './__step-editor'
export { action } from './__step-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
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

	// Get all steps for this workflow to populate the nextStepId dropdown
	const steps = await prisma.step.findMany({
		where: { workflowId },
		select: { id: true, name: true },
		orderBy: { order: 'asc' },
	})

	return json({ step, workflow, steps })
}

export default function EditStepRoute() {
	const { step, workflow, steps } = useLoaderData<typeof loader>()
	return (
		<StepEditor
			step={step}
			workflow={workflow}
			steps={steps}
			title="Edit Step"
			intent="edit"
		/>
	)
}
