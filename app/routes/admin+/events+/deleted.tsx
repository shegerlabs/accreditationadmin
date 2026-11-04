import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { CalendarIcon, RotateCcw, Trash2 } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.event,
		where: { ...tenantFilter, deletedAt: { not: null } },
		searchFields: ['name'],
		orderBy: [{ deletedAt: 'desc' }],
		select: {
			id: true,
			name: true,
			description: true,
			status: true,
			deletedAt: true,
			tenant: {
				select: {
					name: true,
				},
			},
		},
	})

	return json({
		status: 'idle',
		events: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		isGlobalAdmin: user.isGlobalAdmin,
	} as const)
}

export default function DeletedEventsRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions } = data

	return (
		<div className="flex flex-col gap-8">
			<Alert variant="muted" className="mb-2">
				<Trash2 className="h-5 w-5" />
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<AlertTitle>Deleted Events</AlertTitle>
						<AlertDescription>
							Events that have been soft deleted. You can restore them or permanently delete them.
						</AlertDescription>
					</div>
					<Button asChild variant="outline" size="sm">
						<Link to="/admin/events">Back to Events</Link>
					</Button>
				</div>
			</Alert>

			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/events/deleted"
						autoSubmit={false}
						showAddButton={false}
					/>
				</div>
				<DataList
					data={data.events}
					columns={[
						{
							key: 'name',
							header: 'Name',
							render: (event: any) => (
								<div className="flex items-center space-x-2">
									<CalendarIcon className="h-4 w-4 text-muted-foreground" />
									<span className="text-muted-foreground">{event.name}</span>
								</div>
							),
						},
						{
							key: 'status',
							header: 'Status',
							render: (event: any) => event.status,
						},
						{
							key: 'deletedAt',
							header: 'Deleted',
							render: (event: any) => new Date(event.deletedAt).toLocaleDateString(),
						},
					]}
					actions={[
						{
							label: 'Restore',
							icon: <RotateCcw className="h-4 w-4" />,
							href: (event: any) => `/admin/events/${event.id}/restore`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					
					keyExtractor={event => event.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			</div>
		</div>
	)
}
