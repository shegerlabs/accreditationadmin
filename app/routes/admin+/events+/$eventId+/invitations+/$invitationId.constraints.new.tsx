import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { InvitationConstraintEditor } from './__invitation-constraint-editor'
export { action } from './__invitation-constraint-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId, invitationId } = params

	const invitation = await prisma.invitation.findUnique({
		select: {
			id: true,
			organization: true,
			eventId: true,
		},
		where: { id: invitationId },
	})

	invariantResponse(invitation, 'Invitation not found', { status: 404 })
	invariantResponse(invitation.eventId === eventId, 'Invitation not found', {
		status: 404,
	})

	return json({ invitation })
}

export default function AddInvitationConstraintRoute() {
	const { invitation } = useLoaderData<typeof loader>()
	return (
		<InvitationConstraintEditor
			title="Add Constraint"
			invitation={invitation}
			intent="add"
		/>
	)
}
