import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { EditIcon, TrashIcon, UserIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.permission,
		searchFields: ['entity', 'action', 'access', 'description'],
		filterFields: ['entity', 'action', 'access'],
		orderBy: [{ createdAt: 'desc' }],
	})
	const entities = await prisma.permission.findMany({
		distinct: ['entity'],
		select: { entity: true },
	})

	const actions = await prisma.permission.findMany({
		distinct: ['action'],
		select: { action: true },
	})

	const access = await prisma.permission.findMany({
		distinct: ['access'],
		select: { access: true },
	})

	return json({
		status: 'idle',
		permissions: data,
		totalPages,
		currentPage,
		entities,
		actions,
		access,
	} as const)
}

export default function PermissionsListPage() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage } = data
	const isMobile = useMediaQuery({ maxWidth: 767 })

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/permissions"
						autoSubmit={false}
						filters={[
							{
								name: 'entity',
								label: 'Entity',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...data.entities.map(entity => ({
										value: entity.entity,
										label: entity.entity,
									})),
								],
							},
							{
								name: 'action',
								label: 'Action',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...data.actions.map(action => ({
										value: action.action,
										label: action.action,
									})),
								],
							},
							{
								name: 'access',
								label: 'Access',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...data.access.map(access => ({
										value: access.access,
										label: access.access,
									})),
								],
							},
						]}
					/>
				</div>
				<DataList
					data={data.permissions}
					columns={[
						{
							key: 'entity',
							header: 'Entity',
							render: (permission: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{permission.entity}</span>
								</div>
							),
						},
						{ key: 'action', header: 'Action' },
						{ key: 'access', header: 'Access' },
						{ key: 'description', header: 'Description' },
					]}
					actions={[
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (permission: any) => `${permission.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (permission: any) => `${permission.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={permission => permission.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
