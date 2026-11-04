import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { EditIcon, EyeIcon, TrashIcon, UserIcon } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireAdminAccess } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)

	const tenantFilter = user.isGlobalAdmin ? {} : { id: user.tenantId! }

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.tenant,
		where: tenantFilter,
		searchFields: ['name', 'email', 'phone'],
		filterFields: ['status'],
		orderBy: [{ createdAt: 'desc' }],
	})

	return json({
		status: 'idle',
		tenants: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		isGlobalAdmin: user.isGlobalAdmin,
	} as const)
}

export default function TenantsListPage() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions, isGlobalAdmin } = data

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/tenants"
						autoSubmit={false}
						showAddButton={isGlobalAdmin}
					/>
				</div>
				<DataList
					data={data.tenants}
					columns={[
						{
							key: 'name',
							header: 'Name',
							render: (tenant: any) => (
								<Link to={`/admin/tenants/${tenant.id}`} className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{tenant.name}</span>
								</Link>
							),
						},
						{ key: 'email', header: 'Email' },
						{ key: 'phone', header: 'Phone' },
					]}
					actions={[
						{
							label: 'View',
							icon: <EyeIcon className="h-4 w-4" />,
							href: (tenant: any) => `${tenant.id}`,
							variant: 'outline' as const,
						},
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (tenant: any) => `${tenant.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (tenant: any) => `${tenant.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					
					keyExtractor={tenant => tenant.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			</div>
		</div>
	)
}
