import { LoaderFunctionArgs, redirect } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { StepEditor } from './__step-editor'
export { action } from './__step-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	// await requireUserWithRoles(request, ['admin'])

	// const { workflowId, stepId } = params

	// const workflow = await prisma.workflow.findUnique({
	// 	select: {
	// 		id: true,
	// 		tenantId: true,
	// 		eventId: true,
	// 	},
	// 	where: { id: workflowId },
	// })

	// invariantResponse(workflow, 'Not Found', { status: 404 })

	// const step = await prisma.step.findUnique({
	// 	where: { id: stepId },
	// })

	// invariantResponse(step, 'Not Found', { status: 404 })

	// return json({ step, workflow })
	throw redirect('/admin/events')
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
