import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { InvitationEditor } from './__invitation-editor'
export { action } from './__invitation-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId, invitationId } = params

	const event = await prisma.event.findUnique({
		where: { id: eventId },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	const invitation = await prisma.invitation.findUnique({
		where: { id: invitationId },
	})

	invariantResponse(invitation, 'Not Found', { status: 404 })

	return json({ event, invitation })
}

export default function EditInvitationRoute() {
	const { event, invitation } = useLoaderData<typeof loader>()
	return (
		<InvitationEditor
			event={event}
			invitation={invitation}
			title="Edit Invitation"
		/>
	)
}
