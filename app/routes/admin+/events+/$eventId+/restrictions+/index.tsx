import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData, useParams } from '@remix-run/react'
import { EditIcon, LockIcon, TrashIcon, UserIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'staff'])

	const { eventId } = params

	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.restriction,
		searchFields: ['name', { tenant: 'name' }, { event: 'name' }],
		filterFields: ['tenantId', 'eventId'],
		where: { eventId },
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			name: true,
			tenant: {
				select: {
					name: true,
				},
			},
			event: {
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

	const events = await prisma.event.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	return json({
		status: 'idle',
		restrictions: data,
		totalPages,
		currentPage,
		tenants,
		events,
	} as const)
}

export default function IndexRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, tenants, events } = data
	const isMobile = useMediaQuery({ maxWidth: 767 })
	const { eventId } = useParams()

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action={`/admin/events/${eventId}/restrictions`}
						autoSubmit={false}
					/>
				</div>
				<DataList
					data={data.restrictions}
					columns={[
						{
							key: 'name',
							header: 'Restriction',
							render: (restriction: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{restriction.name}</span>
								</div>
							),
						},
					]}
					actions={[
						{
							label: 'Constraints',
							icon: <LockIcon className="h-4 w-4" />,
							href: (restriction: any) => `${restriction.id}/constraints`,
							variant: 'outline' as const,
						},
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (restriction: any) => `${restriction.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (restriction: any) => `${restriction.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={restriction => restriction.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
