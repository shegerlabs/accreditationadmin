import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useLocation, useParams } from '@remix-run/react'
import { EditIcon, LockIcon, TrashIcon, UserIcon } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.restriction,
		searchFields: ['name', { tenant: 'name' }, { event: 'name' }],
		filterFields: ['tenantId', 'eventId'],
		where: { eventId },
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			name: true,
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

	return json({
		status: 'idle',
		restrictions: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
	} as const)
}

export default function RestrictionsRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions } = data
	const { eventId } = useParams()
	const location = useLocation()

	// Check if we're on a constraints route - if so, only render Outlet
	const isConstraintsRoute = location.pathname.includes('/constraints')

	if (isConstraintsRoute) {
		return <Outlet />
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action={`/admin/events/${eventId}/restrictions`}
						autoSubmit={false}
					/>
				</div>
				<DataList
					data={data.restrictions}
					columns={[
						{
							key: 'name',
							header: 'Restriction',
							render: (restriction: any) => (
								<Link to={`/admin/events/${eventId}/restrictions/${restriction.id}/constraints`} className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{restriction.name}</span>
								</Link>
							),
						},
					]}
					actions={[
						{
							label: 'Constraints',
							icon: <LockIcon className="h-4 w-4" />,
							href: (restriction: any) =>
								`/admin/events/${eventId}/restrictions/${restriction.id}/constraints`,
							variant: 'outline' as const,
						},
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (restriction: any) =>
								`/admin/events/${eventId}/restrictions/${restriction.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (restriction: any) =>
								`/admin/events/${eventId}/restrictions/${restriction.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					
					keyExtractor={restriction => restriction.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			</div>

			{/* Outlet for form routes (new, edit, delete) */}
			<Outlet />
		</div>
	)
}
