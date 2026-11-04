import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { EditIcon, GlobeIcon, TrashIcon } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.country,
		searchFields: ['name', 'code'],
		filterFields: [],
		orderBy: [{ name: 'asc' }],
		select: {
			id: true,
			name: true,
			code: true,
		},
	})

	return json({
		status: 'idle',
		countries: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
	} as const)
}

export default function CountriesRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions } = data

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/countries"
						autoSubmit={false}
						filters={[]}
					/>
				</div>
				<DataList
					data={data.countries}
					columns={[
						{
							key: 'name',
							header: 'Name',
							render: (country: any) => (
								<div className="flex items-center space-x-2">
									<GlobeIcon className="h-4 w-4 text-primary" />
									<span>{country.name}</span>
								</div>
							),
						},
						{ key: 'code', header: 'Code' },
					]}
					actions={[
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (country: any) => `${country.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (country: any) => `${country.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					
					keyExtractor={country => country.id}
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
