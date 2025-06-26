import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRole } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { RestrictionEditor } from './__restriction-editor'
export { action } from './__restriction-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { eventId } = params
	await requireUserWithRole(request, 'admin')

	const event = await prisma.event.findUnique({
		select: {
			id: true,
			tenantId: true,
			name: true,
		},
		where: { id: eventId },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	return json({ event })
}

export default function AddRestrictionRoute() {
	const { event } = useLoaderData<typeof loader>()

	return <RestrictionEditor title="Add New Restriction" event={event} />
}
