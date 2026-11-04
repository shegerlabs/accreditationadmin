import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData, useParams } from '@remix-run/react'
import { EditIcon, TrashIcon, UserIcon } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { tenantId } = params

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.participantType,
		searchFields: ['name'],
		where: { tenantId },
		orderBy: [{ createdAt: 'desc' }],
	})

	return json({
		status: 'idle',
		participantTypes: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
	} as const)
}

export default function RolesListPage() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions } = data

	const { tenantId } = useParams()
	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action={`/admin/tenants/${tenantId}/participant-types`}
						autoSubmit={false}
					/>
				</div>
				<DataList
					data={data.participantTypes}
					columns={[
						{
							key: 'name',
							header: 'Name',
							render: (participantType: any) => (
								<Link to={`/admin/tenants/${tenantId}/participant-types/${participantType.id}/edit`} className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{participantType.name}</span>
								</Link>
							),
						},
						{
							key: 'priority',
							header: 'Priority',
							render: (participantType: any) => (
								<span>{participantType.priority}</span>
							),
						},
						{
							key: 'isExemptedFromFullQuota',
							header: 'Full',
							render: (participantType: any) => (
								<span>
									{participantType.isExemptedFromFullQuota ? 'Yes' : 'No'}
								</span>
							),
						},
						{
							key: 'isExemptedFromOpenSessionQuota',
							header: 'Open',
							render: (participantType: any) => (
								<span>
									{participantType.isExemptedFromOpenSessionQuota
										? 'Yes'
										: 'No'}
								</span>
							),
						},
						{
							key: 'isExemptedFromClosedSessionQuota',
							header: 'Closed',
							render: (participantType: any) => (
								<span>
									{participantType.isExemptedFromClosedSessionQuota
										? 'Yes'
										: 'No'}
								</span>
							),
						},
					]}
					actions={[
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (participantType: any) => `${participantType.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (participantType: any) => `${participantType.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					
					keyExtractor={participantType => participantType.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			</div>
		</div>
	)
}
