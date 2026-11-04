import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useLocation, useParams } from '@remix-run/react'
import { EditIcon, List, TrashIcon, UserIcon } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.workflow,
		searchFields: ['name', { participantType: 'name' }],
		filterFields: ['participantTypeId'],
		where: { eventId },
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			name: true,
			participantType: {
				select: {
					name: true,
				},
			},
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
		},
	})

	const participantTypes = await prisma.participantType.findMany({
		where: {
			name: { not: 'Any' },
		},
		select: {
			id: true,
			name: true,
		},
		orderBy: { name: 'asc' },
	})

	return json({
		status: 'idle',
		workflows: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		participantTypes,
	} as const)
}

export default function WorkflowsRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions, participantTypes } = data
	const { eventId } = useParams()
	const location = useLocation()

	// Check if we're on a route that should render standalone (not with the list)
	const isStandaloneRoute = location.pathname.includes('/steps')

	if (isStandaloneRoute) {
		return <Outlet context={{ participantTypes }} />
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action={`/admin/events/${eventId}/workflows`}
						autoSubmit={false}
						filters={[
							{
								name: 'participantTypeId',
								label: 'Participant Type',
								type: 'select',
								options: [
									{ value: 'all', label: 'Clear' },
									...participantTypes.map(participantType => ({
										value: participantType.id,
										label: participantType.name,
									})),
								],
							},
						]}
						extras={[
							{
								type: 'dropdown',
								label: 'More',
								items: [
									{
										label: 'Bulk Create',
										to: 'bulk-create',
										icon: 'layers',
									},
									{
										label: 'Remove All',
										to: 'remove-all',
										icon: 'cross-1',
									},
								],
							},
						]}
					/>
				</div>
				<DataList
					data={data.workflows}
					columns={[
						{
							key: 'name',
							header: 'Workflow',
							render: (workflow: any) => (
								<Link to={`/admin/events/${eventId}/workflows/${workflow.id}/steps/visual`} className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{workflow.name}</span>
								</Link>
							),
						},
						{
							key: 'participantType',
							header: 'Participant Type',
							render: (workflow: any) => (
								<span>{workflow.participantType.name}</span>
							),
						},
					]}
					actions={[
						{
							label: 'Steps',
							icon: <List className="h-4 w-4" />,
							href: (workflow: any) =>
								`/admin/events/${eventId}/workflows/${workflow.id}/steps/visual`,
							variant: 'outline' as const,
						},
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (workflow: any) =>
								`/admin/events/${eventId}/workflows/${workflow.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (workflow: any) =>
								`/admin/events/${eventId}/workflows/${workflow.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					
					keyExtractor={workflow => workflow.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			</div>

			{/* Outlet for modal routes (new, edit, delete) */}
			<Outlet context={{ participantTypes }} />
		</div>
	)
}
