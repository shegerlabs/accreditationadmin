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

	const { restrictionId } = params

	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.constraint,
		searchFields: ['name'],
		where: {
			restrictionId,
		},
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			name: true,
			accessLevel: true,
			quota: true,
		},
	})

	return json({
		status: 'idle',
		constraints: data,
		totalPages,
		currentPage,
	} as const)
}

export default function IndexRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage } = data
	const isMobile = useMediaQuery({ maxWidth: 767 })
	const { eventId, restrictionId } = useParams()

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action={`/admin/events/${eventId}/restrictions/${restrictionId}/constraints`}
						autoSubmit={false}
						extras={[
							{
								label: 'Back',
								to: `/admin/events/${eventId}/restrictions`,
								icon: 'chevron-left',
							},
						]}
					/>
				</div>
				<DataList
					data={data.constraints}
					columns={[
						{
							key: 'name',
							header: 'Constraint',
							render: (constraint: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{constraint.name}</span>
								</div>
							),
						},
						{
							key: 'accessLevel',
							header: 'Access Level',
							render: (constraint: any) => constraint.accessLevel,
						},
						{
							key: 'quota',
							header: 'Quota',
							render: (constraint: any) =>
								Number(constraint.quota) === 0 ? 'Unlimited' : constraint.quota,
						},
					]}
					actions={[
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (constraint: any) => `${constraint.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (constraint: any) => `${constraint.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={constraint => constraint.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
