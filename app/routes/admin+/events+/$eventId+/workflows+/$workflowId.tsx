import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { getWorkflowParticipantTypes } from '~/utils/event-participant-types.server'
import { invariantResponse } from '~/utils/misc'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(currentUser)

	const { eventId } = params

	// Verify the event belongs to the current user's tenant
	const event = await prisma.event.findFirst({
		where: {
			id: eventId,
			...tenantFilter,
		},
		select: { tenantId: true },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	const participantTypes = await getWorkflowParticipantTypes(eventId!)

	const roles = await prisma.role.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	return json({ participantTypes, roles })
}

export default function IndexRoute() {
	const { participantTypes, roles } = useLoaderData<typeof loader>()

	return <Outlet context={{ participantTypes, roles }} />
}
