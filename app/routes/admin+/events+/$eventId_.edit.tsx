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

	// Tenant admins can only edit their own tenant's events
	if (!user.isGlobalAdmin && event.tenantId !== user.tenantId) {
		throw json({ message: 'Access denied' }, { status: 403 })
	}

	return json({
		event,
		isGlobalAdmin: user.isGlobalAdmin,
		userTenantId: user.tenantId,
	})
}

export default function EditEventRoute() {
	const { event, isGlobalAdmin, userTenantId } = useLoaderData<typeof loader>()

	return (
		<EventEditor
			event={event}
			title="Edit Event"
			isGlobalAdmin={isGlobalAdmin}
			userTenantId={userTenantId}
		/>
	)
}
