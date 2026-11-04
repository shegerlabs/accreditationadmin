import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { CalendarIcon, EditIcon, EyeIcon, Trash2, TrashIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.event,
		where: { ...tenantFilter, deletedAt: null },
		searchFields: ['name'],
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			name: true,
			description: true,
			status: true,
			tenant: {
				select: {
					name: true,
				},
			},
		},
	})

	// Global admins see tenant filter dropdown, tenant admins don't need it
	const tenants = user.isGlobalAdmin
		? await prisma.tenant.findMany({
				select: {
					id: true,
					name: true,
				},
			})
		: []

	// Count deleted events
	const deletedCount = await prisma.event.count({
		where: { ...tenantFilter, deletedAt: { not: null } },
	})

	return json({
		status: 'idle',
		events: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		tenants,
		isGlobalAdmin: user.isGlobalAdmin,
		deletedCount,
	} as const)
}

export default function IndexRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions, tenants, isGlobalAdmin, deletedCount } = data

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6 flex items-center justify-between gap-4">
					<div className="flex-1">
						<SearchBar
						status={data.status}
						action="/admin/events"
						autoSubmit={false}
						filters={
							isGlobalAdmin
								? [
										{
											name: 'tenant',
											label: 'Tenant',
											type: 'select',
											options: [
												{ value: 'all', label: 'All' },
												...tenants.map(tenant => ({
													value: tenant.id,
													label: tenant.name,
												})),
											],
										},
									]
								: []
						}
					/>
					</div>
					{deletedCount > 0 && (
						<Button asChild variant="outline" size="sm">
							<Link to="deleted" className="flex items-center gap-2">
								<Trash2 className="h-4 w-4" />
								Deleted ({deletedCount})
							</Link>
						</Button>
					)}
				</div>
				<DataList
					data={data.events}
					columns={[
						{
							key: 'name',
							header: 'Name',
							render: (event: any) => (
								<Link to={`/admin/events/${event.id}`} className="flex items-center space-x-2">
									<CalendarIcon className="h-4 w-4 text-primary" />
									<span>{event.name}</span>
								</Link>
							),
						},
						{
							key: 'status',
							header: 'Status',
							render: (event: any) => event.status,
						},
					]}
					actions={[
						{
							label: 'View',
							icon: <EyeIcon className="h-4 w-4" />,
							href: (event: any) => `${event.id}`,
							variant: 'outline' as const,
						},
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (event: any) => `${event.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (event: any) => `/admin/events/${event.id}/delete`,
							variant: 'outline' as const,
							show: (event: any) => event.status === 'DRAFT',
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
