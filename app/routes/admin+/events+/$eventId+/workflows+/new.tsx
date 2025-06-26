import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { WorkflowEditor } from './__workflow-editor'
export { action } from './__workflow-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		select: { id: true, tenantId: true, name: true },
		where: { id: eventId },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	return json({ event })
}

export default function AddWorkflowRoute() {
	const { event } = useLoaderData<typeof loader>()
	return <WorkflowEditor title="Add New Workflow" intent="add" event={event} />
}
