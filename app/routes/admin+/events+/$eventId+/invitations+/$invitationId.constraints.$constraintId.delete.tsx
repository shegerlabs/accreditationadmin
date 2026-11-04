import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { InvitationConstraintEditor } from './__invitation-constraint-editor'
export { action } from './__invitation-constraint-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId, invitationId, constraintId } = params

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

	const constraint = await prisma.invitationConstraint.findUnique({
		where: { id: constraintId },
		select: {
			id: true,
			invitationId: true,
			participantTypeId: true,
			accessLevel: true,
			quota: true,
			sourceRestrictionId: true,
		},
	})

	invariantResponse(constraint, 'Constraint not found', { status: 404 })
	invariantResponse(
		constraint.invitationId === invitationId,
		'Constraint not found',
		{ status: 404 },
	)

	return json({ invitation, constraint })
}

export default function DeleteInvitationConstraintRoute() {
	const { invitation, constraint } = useLoaderData<typeof loader>()
	return (
		<InvitationConstraintEditor
			title="Delete Constraint"
			invitation={invitation}
			constraint={constraint}
			intent="delete"
		/>
	)
}
