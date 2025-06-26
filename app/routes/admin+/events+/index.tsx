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
		model: prisma.event,
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

	const tenants = await prisma.tenant.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	return json({
		status: 'idle',
		events: data,
		totalPages,
		currentPage,
		tenants,
	} as const)
}

export default function IndexRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, tenants } = data
	const isMobile = useMediaQuery({ maxWidth: 767 })

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/events"
						autoSubmit={false}
						filters={[
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
						]}
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
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{event.name}</span>
								</div>
							),
						},
						{ key: 'description', header: 'Description' },
						{
							key: 'tenant',
							header: 'Tenant',
							render: (event: any) => event.tenant.name,
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
						// Delete
						// {
						// 	label: 'Delete',
						// 	icon: <TrashIcon className="h-4 w-4" />,
						// 	href: (event: any) => `/admin/events/${event.id}/delete`,
						// 	variant: 'destructive' as const,
						// },
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={event => event.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
