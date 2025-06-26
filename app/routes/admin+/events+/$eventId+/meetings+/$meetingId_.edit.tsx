import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { MeetingEditor } from './__meeting-editor'
export { action } from './__meeting-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const { eventId, meetingId } = params

	const event = await prisma.event.findUnique({
		where: { id: eventId },
	})

	invariantResponse(event, 'Not Found', { status: 404 })

	const meeting = await prisma.meeting.findUnique({
		where: { id: meetingId },
	})

	invariantResponse(meeting, 'Not Found', { status: 404 })

	return json({ meeting, event })
}

export default function EditMeetingRoute() {
	const { meeting, event } = useLoaderData<typeof loader>()
	return <MeetingEditor meeting={meeting} title="Edit Meeting" event={event} />
}
