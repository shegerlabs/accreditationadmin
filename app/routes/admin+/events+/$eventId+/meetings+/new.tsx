import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRole } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { MeetingEditor } from './__meeting-editor'
export { action } from './__meeting-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')

	const { eventId } = params

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

export default function AddMeetingRoute() {
	const { event } = useLoaderData<typeof loader>()

	return <MeetingEditor title="Add Meeting" event={event} />
}
