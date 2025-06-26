import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData, useParams } from '@remix-run/react'
import { EditIcon, TrashIcon, UserIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { eventId } = params

	await requireUserWithRoles(request, ['admin', 'staff'])

	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.meeting,
		searchFields: [
			{ meetingType: 'name' },
			{ tenant: 'name' },
			{ event: 'name' },
			{ venue: 'name' },
		],
		filterFields: [
			'tenantId',
			'eventId',
			'venueId',
			'meetingTypeId',
			'accessLevel',
		],
		where: { eventId },
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			startDate: true,
			endDate: true,
			accessLevel: true,
			tenant: {
				select: {
					name: true,
				},
			},
			event: {
				select: {
					name: true,
				},
			},
			venue: {
				select: {
					name: true,
				},
			},
			meetingType: {
				select: {
					name: true,
				},
			},
		},
	})

	const tenants = await prisma.tenant.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const events = await prisma.event.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const venues = await prisma.venue.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const meetingTypes = await prisma.meetingType.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	return json({
		status: 'idle',
		meetings: data,
		totalPages,
		currentPage,
		tenants,
		events,
		venues,
		meetingTypes,
	} as const)
}

export default function IndexRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, tenants, events, venues, meetingTypes } =
		data
	const isMobile = useMediaQuery({ maxWidth: 767 })
	const params = useParams()
	const eventId = params.eventId

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action={`/admin/events/${eventId}/meetings`}
						autoSubmit={false}
						filters={[
							{
								name: 'venueId',
								label: 'Venue',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...venues.map(venue => ({
										value: venue.id,
										label: venue.name,
									})),
								],
							},
							{
								name: 'meetingTypeId',
								label: 'Meeting Type',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...meetingTypes.map(meetingType => ({
										value: meetingType.id,
										label: meetingType.name,
									})),
								],
							},
							{
								name: 'accessLevel',
								label: 'Access Level',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'FREE', label: 'FREE' },
									{ value: 'OPEN', label: 'OPEN' },
									{ value: 'CLOSED', label: 'CLOSED' },
								],
							},
						]}
					/>
				</div>
				<DataList
					data={data.meetings}
					columns={[
						{
							key: 'name',
							header: 'Meeting Type',
							render: (meeting: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{meeting.meetingType.name}</span>
								</div>
							),
						},
						// {
						// 	key: 'startDate',
						// 	header: 'Start Date',
						// 	render: (meeting: any) =>
						// 		format(new Date(meeting.startDate), 'yyyy-MM-dd'),
						// },
						// {
						// 	key: 'endDate',
						// 	header: 'End Date',
						// 	render: (meeting: any) =>
						// 		format(new Date(meeting.endDate), 'yyyy-MM-dd'),
						// },
						{
							key: 'venue',
							header: 'Venue',
							render: (meeting: any) => meeting.venue.name,
						},
						{
							key: 'accessLevel',
							header: 'Access Level',
							render: (meeting: any) => meeting.accessLevel,
						},
					]}
					actions={[
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (meeting: any) => `${meeting.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (meeting: any) => `${meeting.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={meeting => meeting.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
