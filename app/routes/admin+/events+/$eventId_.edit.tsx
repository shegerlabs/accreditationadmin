import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { EventEditor } from './__event-editor'
export { action } from './__event-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		where: { id: eventId },
	})

	invariantResponse(event, 'Not Found', { status: 404 })

	return json({ event })
}

export default function EditEventRoute() {
	const { event } = useLoaderData<typeof loader>()
	return <EventEditor event={event} title="Edit Event" />
}
