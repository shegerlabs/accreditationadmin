import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { WorkflowEditor } from './__workflow-editor'
export { action } from './__workflow-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(currentUser)

	const { eventId, workflowId } = params

	const event = await prisma.event.findFirst({
		select: { id: true, tenantId: true, name: true },
		where: {
			id: eventId,
			...tenantFilter,
		},
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	const workflow = await prisma.workflow.findFirst({
		where: {
			id: workflowId,
			event: tenantFilter,
		},
	})

	invariantResponse(workflow, 'Not Found', { status: 404 })

	return json({ event, workflow })
}

export default function EditWorkflowRoute() {
	const { event, workflow } = useLoaderData<typeof loader>()
	return (
		<WorkflowEditor
			event={event}
			workflow={workflow}
			title="Edit Workflow"
			intent="edit"
		/>
	)
}
