import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useOutletContext } from '@remix-run/react'
import { requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { AccessEditor } from './__access-editor'
export { action } from './__access-editor.server'

type Workflow = {
	id: string
	name: string
	participantType: { id: string; name: string }
	steps: { id: string; name: string; order: number; requiresAssignment: boolean }[]
}

type OutletContext = {
	event: { id: string; name: string; tenantId: string }
	roles: { id: string; name: string }[]
	workflows: Workflow[]
	participantTypes: { id: string; name: string }[]
	assignableStepNames: string[]
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const { eventId } = params

	invariantResponse(eventId, 'Event ID is required')

	// Non-global admins must have a tenant
	if (!user.isGlobalAdmin && !user.tenantId) {
		throw json({ error: 'Access denied' }, { status: 403 })
	}

	// Verify event access
	const event = await prisma.event.findFirst({
		where: {
			id: eventId,
			...(user.isGlobalAdmin ? {} : { tenantId: user.tenantId! }),
		},
		select: { id: true, name: true, tenantId: true },
	})

	invariantResponse(event, 'Access denied', { status: 403 })

	return json({ eventId: event.id })
}

export default function NewAccessRoute() {
	const { eventId } = useLoaderData<typeof loader>()
	const { roles, workflows, participantTypes, assignableStepNames } =
		useOutletContext<OutletContext>()

	return (
		<AccessEditor
			title="Grant Access"
			intent="create"
			roles={roles}
			workflows={workflows}
			participantTypes={participantTypes}
			assignableStepNames={assignableStepNames}
			eventId={eventId}
		/>
	)
}
