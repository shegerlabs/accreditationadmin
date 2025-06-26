import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { EditIcon, ListIcon, UserIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.menu,
		searchFields: ['name'],
		orderBy: [{ createdAt: 'desc' }],
	})

	return json({
		status: 'idle',
		menus: data,
		totalPages,
		currentPage,
	} as const)
}

export default function MenusPage() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage } = data
	const isMobile = useMediaQuery({ maxWidth: 767 })

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/menus"
						autoSubmit={false}
						showAddButton={false}
					/>
				</div>
				<DataList
					data={data.menus}
					columns={[
						{
							key: 'name',
							header: 'Name',
							render: (menu: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{menu.name}</span>
								</div>
							),
						},
						{ key: 'title', header: 'Title' },
					]}
					actions={[
						{
							label: 'Items',
							icon: <ListIcon className="h-4 w-4" />,
							href: (menu: any) => `/admin/menus/${menu.id}/items`,
							variant: 'outline' as const,
						},
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (menu: any) => `/admin/menus/${menu.id}/edit`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={menu => menu.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
