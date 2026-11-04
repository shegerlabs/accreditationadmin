import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { EventEditor } from './__event-editor'
export { action } from './__event-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const { eventId } = params

	const event = await prisma.event.findUnique({
		where: { id: eventId },
	})

	invariantResponse(event, 'Not Found', { status: 404 })

	// Prevent deleting already-deleted events
	if (event.deletedAt) {
		throw json({ message: 'This event has already been deleted' }, { status: 400 })
	}

	// Only draft events can be deleted
	if (event.status !== 'DRAFT') {
		throw json(
			{ message: 'Only draft events can be deleted. Please close the event first if you want to archive it.' },
			{ status: 400 },
		)
	}

	// Tenant admins can only delete their own tenant's events
	if (!user.isGlobalAdmin && event.tenantId !== user.tenantId) {
		throw json({ message: 'Access denied' }, { status: 403 })
	}

	return json({
		event,
		isGlobalAdmin: user.isGlobalAdmin,
		userTenantId: user.tenantId,
	})
}

export default function DeleteEventRoute() {
	const { event, isGlobalAdmin, userTenantId } = useLoaderData<typeof loader>()

	return (
		<EventEditor
			event={event}
			title="Delete Event"
			intent="delete"
			isGlobalAdmin={isGlobalAdmin}
			userTenantId={userTenantId}
		/>
	)
}
