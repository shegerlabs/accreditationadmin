import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { WorkflowEditor } from './__workflow-editor'
export { action } from './__workflow-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId, workflowId } = params

	const event = await prisma.event.findUnique({
		select: { id: true, tenantId: true, name: true },
		where: { id: eventId },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	const workflow = await prisma.workflow.findUnique({
		where: { id: workflowId },
	})

	invariantResponse(workflow, 'Not Found', { status: 404 })

	return json({ event, workflow })
}

export default function EditWorkflowRoute() {
	const { event, workflow } = useLoaderData<typeof loader>()
	return (
		<WorkflowEditor event={event} workflow={workflow} title="Edit Workflow" />
	)
}
