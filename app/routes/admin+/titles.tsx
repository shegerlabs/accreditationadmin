import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { EditIcon, TrashIcon, UserIcon } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.title,
		searchFields: ['name'],
		filterFields: [],
		orderBy: [{ name: 'asc' }],
		select: {
			id: true,
			name: true,
		},
	})

	return json({
		status: 'idle',
		titles: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
	} as const)
}

export default function TitlesRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions } = data

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/titles"
						autoSubmit={false}
						filters={[]}
					/>
				</div>
				<DataList
					data={data.titles}
					columns={[
						{
							key: 'name',
							header: 'Name',
							render: (title: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{title.name}</span>
								</div>
							),
						},
					]}
					actions={[
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (title: any) => `${title.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (title: any) => `${title.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					
					keyExtractor={title => title.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			</div>

			{/* Outlet for modal routes (new, edit, delete) */}
			<Outlet />
		</div>
	)
}
