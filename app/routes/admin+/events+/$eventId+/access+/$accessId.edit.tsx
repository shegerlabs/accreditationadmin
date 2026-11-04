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

	// Get all IDs and step name from query param
	const url = new URL(request.url)
	const idsParam = url.searchParams.get('ids')
	const stepName = url.searchParams.get('stepName') ?? ''
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
					id: true,
					username: true,
					email: true,
				},
			},
			role: {
				select: {
					id: true,
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

	// Get participant type IDs from the access records
	const accessRecords = await prisma.userEventAccess.findMany({
		where: {
			id: { in: allIds },
		},
		select: {
			step: {
				select: {
					workflow: {
						select: {
							participantTypeId: true,
						},
					},
				},
			},
		},
	})

	const participantTypeIds = accessRecords
		.map(r => r.step?.workflow?.participantTypeId)
		.filter((id): id is string => id !== undefined)

	return json({
		access: {
			id: access.id,
			userId: access.userId,
			roleId: access.roleId,
			stepId: access.stepId,
			stepName: stepName || access.step?.name || '',
			user: access.user,
			role: access.role,
		},
		eventId: event.id,
		allIds,
		participantTypeIds,
		recordCount: allIds.length,
	})
}

export default function EditAccessRoute() {
	const { access, eventId, allIds, participantTypeIds, recordCount } =
		useLoaderData<typeof loader>()
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
			existingUser={access.user}
			existingStepName={access.stepName}
			allIds={allIds}
			existingParticipantTypeIds={participantTypeIds}
			recordCount={recordCount}
			title={`Edit Access for ${access.user.username}`}
			intent="edit"
			roles={roles}
			workflows={workflows}
			participantTypes={participantTypes}
			assignableStepNames={assignableStepNames}
			eventId={eventId}
		/>
	)
}
