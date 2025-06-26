import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData, useParams } from '@remix-run/react'
import { EditIcon, TrashIcon, UserIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { tenantId } = params

	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.venue,
		searchFields: ['name'],
		where: { tenantId },
		orderBy: [{ createdAt: 'desc' }],
	})

	return json({
		status: 'idle',
		venues: data,
		totalPages,
		currentPage,
	} as const)
}

export default function VenuesListPage() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage } = data
	const isMobile = useMediaQuery({ maxWidth: 767 })

	const { tenantId } = useParams()

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action={`/admin/tenants/${tenantId}/venues`}
						autoSubmit={false}
					/>
				</div>
				<DataList
					data={data.venues}
					columns={[
						{
							key: 'name',
							header: 'Name',
							render: (venue: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{venue.name}</span>
								</div>
							),
						},
						{ key: 'description', header: 'Description' },
					]}
					actions={[
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (venue: any) => `${venue.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (venue: any) => `${venue.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={venue => venue.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
