import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { EyeIcon, UserIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.tenant,
		searchFields: ['name', 'email', 'phone'],
		filterFields: ['status'],
		orderBy: [{ createdAt: 'desc' }],
	})

	return json({
		status: 'idle',
		tenants: data,
		totalPages,
		currentPage,
	} as const)
}

export default function TenantsListPage() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage } = data
	const isMobile = useMediaQuery({ maxWidth: 767 })

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/tenants"
						autoSubmit={false}
					/>
				</div>
				<DataList
					data={data.tenants}
					columns={[
						{
							key: 'name',
							header: 'Name',
							render: (tenant: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{tenant.name}</span>
								</div>
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
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={tenant => tenant.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
