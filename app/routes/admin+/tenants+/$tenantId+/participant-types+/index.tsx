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
	} as const)
}

export default function RolesListPage() {
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
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{participantType.name}</span>
								</div>
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
							key: 'canSendPrivateRequest',
							header: 'Private',
							render: (participantType: any) => (
								<span>
									{participantType.canSendPrivateRequest ? 'Yes' : 'No'}
								</span>
							),
						},
						{
							key: 'canSendAnonymousRequest',
							header: 'Anonymous',
							render: (participantType: any) => (
								<span>
									{participantType.canSendAnonymousRequest ? 'Yes' : 'No'}
								</span>
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
					isMobile={isMobile}
					keyExtractor={participantType => participantType.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
