import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { EditIcon, LockIcon, TrashIcon, UserIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.role,
		searchFields: ['name'],
		orderBy: [{ createdAt: 'desc' }],
	})

	return json({
		status: 'idle',
		roles: data,
		totalPages,
		currentPage,
	} as const)
}

export default function RolesListPage() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage } = data
	const isMobile = useMediaQuery({ maxWidth: 767 })

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/roles"
						autoSubmit={false}
						extras={[
							{
								label: 'Import',
								to: 'import',
								icon: 'arrow-up',
							},
						]}
					/>
				</div>
				<DataList
					data={data.roles}
					columns={[
						{
							key: 'name',
							header: 'Name',
							render: (role: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{role.name}</span>
								</div>
							),
						},
						{ key: 'description', header: 'Description' },
					]}
					actions={[
						{
							label: 'Permissions',
							icon: <LockIcon className="h-4 w-4" />,
							href: (role: any) => `${role.id}/permissions`,
							variant: 'outline' as const,
						},
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (role: any) => `${role.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (role: any) => `${role.id}/delete`,
							variant: 'destructive' as const,
						},
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={role => role.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
