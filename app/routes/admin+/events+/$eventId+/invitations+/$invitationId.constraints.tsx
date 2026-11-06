import { AccessLevel } from '@prisma/client'
import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData, useLocation, useParams } from '@remix-run/react'
import { EditIcon, TrashIcon, UserIcon } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Badge } from '~/components/ui/badge'
import { requireUserWithRoles } from '~/utils/auth.server'
import { getEventParticipantTypes } from '~/utils/event-participant-types.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId, invitationId } = params

	const invitation = await prisma.invitation.findUnique({
		where: { id: invitationId },
		select: { id: true, organization: true, email: true, eventId: true },
	})

	invariantResponse(invitation, 'Invitation not found', { status: 404 })
	invariantResponse(invitation.eventId === eventId, 'Invitation not found', {
		status: 404,
	})

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.invitationConstraint,
		searchFields: [],
		where: {
			invitationId,
		},
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			participantTypeId: true,
			accessLevel: true,
			quota: true,
			sourceRestrictionId: true,
			participantType: {
				select: {
					name: true,
				},
			},
			sourceRestriction: {
				select: {
					name: true,
				},
			},
		},
	})

	const participantTypes = await getEventParticipantTypes(eventId!, {
		includeAny: true,
	})

	const accessLevels = Object.values(AccessLevel)

	return json({
		status: 'idle',
		invitation,
		constraints: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		participantTypes,
		accessLevels,
	} as const)
}

export default function InvitationConstraintsRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions, invitation, participantTypes, accessLevels } = data
	const { eventId, invitationId } = useParams()
	const location = useLocation()

	// Check if we're on a nested route that should show as standalone
	const isStandaloneRoute = false // All child routes will be modals

	if (isStandaloneRoute) {
		return <Outlet context={{ participantTypes, accessLevels }} />
	}

	return (
		<>
			<div className="flex flex-col gap-8">
				<div className="w-full">
					<div className="mb-4">
						<h2 className="text-lg font-semibold">
							Constraints for {invitation.organization}
						</h2>
						<p className="text-sm text-muted-foreground">{invitation.email}</p>
					</div>
					<div className="mb-6">
						<SearchBar
							status={data.status}
							action={`/admin/events/${eventId}/invitations/${invitationId}/constraints`}
							autoSubmit={false}
							extras={[
								{
									label: 'Back',
									to: `/admin/events/${eventId}/invitations`,
									icon: 'chevron-left',
								},
							]}
						/>
					</div>
					<DataList
						data={data.constraints}
						columns={[
							{
								key: 'participantType',
								header: 'Participant Type',
								render: (constraint: any) => (
									<div className="flex items-center space-x-2">
										<UserIcon className="h-4 w-4 text-primary" />
										<span>{constraint.participantType.name}</span>
									</div>
								),
							},
							{
								key: 'accessLevel',
								header: 'Access Level',
								render: (constraint: any) => (
									<Badge variant="secondary">{constraint.accessLevel}</Badge>
								),
							},
							{
								key: 'quota',
								header: 'Quota',
								render: (constraint: any) =>
									constraint.quota != null ? constraint.quota : 'Unlimited',
							},
							{
								key: 'sourceRestriction',
								header: 'Source Template',
								render: (constraint: any) =>
									constraint.sourceRestriction?.name ?? '-',
							},
						]}
						actions={[
							{
								label: 'Edit',
								icon: <EditIcon className="h-4 w-4" />,
								href: (constraint: any) =>
									`/admin/events/${eventId}/invitations/${invitationId}/constraints/${constraint.id}/edit`,
								variant: 'outline' as const,
							},
							{
								label: 'Delete',
								icon: <TrashIcon className="h-4 w-4" />,
								href: (constraint: any) =>
									`/admin/events/${eventId}/invitations/${invitationId}/constraints/${constraint.id}/delete`,
								variant: 'outline' as const,
							},
						]}
						status={data.status}
						
						keyExtractor={constraint => constraint.id}
						totalPages={totalPages}
						currentPage={currentPage}
						defaultPageSize={defaultPageSize}
						pageSizeOptions={pageSizeOptions}
					/>
				</div>
			</div>
			<Outlet context={{ participantTypes, accessLevels }} />
		</>
	)
}
