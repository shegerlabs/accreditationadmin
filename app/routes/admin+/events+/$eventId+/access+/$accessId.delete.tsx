import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useOutletContext } from '@remix-run/react'
import { requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { AccessEditor } from './__access-editor'
export { action } from './__access-editor.server'

type Workflow = {
	id: string
	name: string
	participantType: { id: string; name: string }
	steps: { id: string; name: string; order: number; requiresAssignment: boolean }[]
}

type OutletContext = {
	event: { id: string; name: string; tenantId: string }
	roles: { id: string; name: string }[]
	workflows: Workflow[]
	participantTypes: { id: string; name: string }[]
	assignableStepNames: string[]
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const { eventId, accessId } = params

	invariantResponse(eventId, 'Event ID is required')
	invariantResponse(accessId, 'Access ID is required')

	// Get all IDs from query param (for grouped deletion)
	const url = new URL(request.url)
	const idsParam = url.searchParams.get('ids')
	const allIds = idsParam ? idsParam.split(',') : [accessId]

	// Non-global admins must have a tenant
	if (!user.isGlobalAdmin && !user.tenantId) {
		throw json({ error: 'Access denied' }, { status: 403 })
	}

	// Verify event access
	const event = await prisma.event.findFirst({
		where: {
			id: eventId,
			...(user.isGlobalAdmin ? {} : { tenantId: user.tenantId! }),
		},
		select: { id: true, name: true },
	})

	invariantResponse(event, 'Access denied', { status: 403 })

	// Get the first access record for display
	const access = await prisma.userEventAccess.findFirst({
		where: {
			id: accessId,
			eventId: eventId,
		},
		select: {
			id: true,
			userId: true,
			roleId: true,
			stepId: true,
			user: {
				select: {
					username: true,
					email: true,
				},
			},
			role: {
				select: {
					name: true,
				},
			},
			step: {
				select: {
					name: true,
				},
			},
		},
	})

	invariantResponse(access, 'Access record not found', { status: 404 })

	return json({ access, eventId: event.id, allIds, recordCount: allIds.length })
}

export default function DeleteAccessRoute() {
	const { access, eventId, allIds, recordCount } = useLoaderData<typeof loader>()
	const { roles, workflows, participantTypes, assignableStepNames } =
		useOutletContext<OutletContext>()

	return (
		<AccessEditor
			access={{
				id: access.id,
				userId: access.userId,
				roleId: access.roleId,
				stepId: access.stepId ?? '',
			}}
			allIds={allIds}
			recordCount={recordCount}
			title={`Revoke Access for ${access.user.username}`}
			intent="delete"
			roles={roles}
			workflows={workflows}
			participantTypes={participantTypes}
			assignableStepNames={assignableStepNames}
			eventId={eventId}
		/>
	)
}
