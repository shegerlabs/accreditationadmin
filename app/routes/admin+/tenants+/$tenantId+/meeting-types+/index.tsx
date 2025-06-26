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
		model: prisma.meetingType,
		searchFields: ['name'],
		where: { tenantId },
		orderBy: [{ createdAt: 'desc' }],
	})

	return json({
		status: 'idle',
		meetingTypes: data,
		totalPages,
		currentPage,
	} as const)
}

export default function IndexRoute() {
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
						action={`/admin/tenants/${tenantId}/meeting-types`}
						autoSubmit={false}
					/>
				</div>
				<DataList
					data={data.meetingTypes}
					columns={[
						{
							key: 'name',
							header: 'Name',
							render: (meetingType: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{meetingType.name}</span>
								</div>
							),
						},
						{ key: 'description', header: 'Description' },
					]}
					actions={[
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (meetingType: any) => `${meetingType.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (meetingType: any) => `${meetingType.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={meetingType => meetingType.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
