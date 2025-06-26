import { LoaderFunctionArgs, redirect } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { EventEditor } from './__event-editor'
export { action } from './__event-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	// const { eventId } = params

	// const event = await prisma.event.findUnique({
	// 	where: { id: eventId },
	// })

	// invariantResponse(event, 'Not Found', { status: 404 })

	// return json({ event })
	throw redirect('/admin/events')
}

export default function DeleteEventRoute() {
	const { event } = useLoaderData<typeof loader>()
	return <EventEditor event={event} title="Delete Event" intent="delete" />
}
