import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { EditIcon, LockOpenIcon, TrashIcon, UserIcon } from 'lucide-react'
import { parseWithZod } from 'node_modules/@conform-to/zod/parse'
import { useMediaQuery } from 'react-responsive'
import { z } from 'zod'
import { ActionForm } from '~/components/action-form'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { AUTH_SETTINGS } from '~/utils/constants'
import { validateCSRF } from '~/utils/csrf.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

export const UnlockUserSchema = z.object({
	userId: z.string(),
})

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.user,
		searchFields: ['name', 'email', 'username'],
		filterFields: ['status'],
		orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
		select: {
			id: true,
			name: true,
			email: true,
			username: true,
			status: true,
			lockCount: true,
		},
	})

	const tenants = await prisma.tenant.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	return json({
		status: 'idle',
		tenants,
		users: data,
		totalPages,
		currentPage,
	} as const)
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	const submission = parseWithZod(formData, {
		schema: UnlockUserSchema,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { userId } = submission.value

	if (intent === 'unlock') {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				status: true,
				lockCount: true,
			},
		})
		invariantResponse(user, 'User not found', { status: 404 })

		const isPermanentlyLocked =
			user.status === 'LOCKED' && user.lockCount >= AUTH_SETTINGS.MAX_LOCK_COUNT

		await prisma.user.update({
			where: { id: userId },
			data: {
				status: 'ACTIVE',
				failedLoginAttempts: 0,
				lockedAt: null,
				lockReason: null,
				autoUnlockAt: null,
				...(isPermanentlyLocked ? { lockCount: 0 } : {}),
			},
		})
	}

	throw await redirectWithToast(`/admin/users`, {
		type: 'success',
		title: 'User Unlocked',
		description: 'The user has been unlocked',
	})
}

export default function UsersListPage() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage } = data
	const isMobile = useMediaQuery({ maxWidth: 767 })

	const unlockAction = (user: any) => (
		<ActionForm
			method="POST"
			data={{
				userId: user.id,
			}}
			buttonContent={<LockOpenIcon className="h-4 w-4" />}
			buttonVariant="outline"
			buttonSize="sm"
			intent="unlock"
		/>
	)

	const getStatusBadge = (user: any) => {
		const isPermanentlyLocked =
			user.status === 'LOCKED' && user.lockCount >= AUTH_SETTINGS.MAX_LOCK_COUNT

		if (isPermanentlyLocked) {
			return (
				<span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
					Permanently Locked
				</span>
			)
		}

		const statusColors = {
			ACTIVE: 'text-green-700 bg-green-50 ring-green-600/10',
			INACTIVE: 'text-yellow-700 bg-yellow-50 ring-yellow-600/10',
			LOCKED: 'text-orange-700 bg-orange-50 ring-orange-600/10',
			DELETED: 'text-gray-700 bg-gray-50 ring-gray-600/10',
		}

		return (
			<span
				className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
					statusColors[user.status as keyof typeof statusColors]
				}`}
			>
				{user.status}
			</span>
		)
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/users"
						autoSubmit={false}
						filters={[
							{
								name: 'tenantId',
								label: 'Tenant',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...data.tenants.map(tenant => ({
										value: tenant.id,
										label: tenant.name,
									})),
								],
							},
							{
								name: 'status',
								label: 'Status',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'ACTIVE', label: 'Active' },
									{ value: 'INACTIVE', label: 'Inactive' },
									{ value: 'LOCKED', label: 'Locked' },
									{ value: 'DELETED', label: 'Deleted' },
								],
							},
						]}
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
					data={data.users}
					actionWidth="96"
					columns={[
						{
							key: 'name',
							header: 'Name',
							render: (user: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{user.name}</span>
								</div>
							),
						},
						{ key: 'email', header: 'Email' },
						{ key: 'username', header: 'Username' },
						{
							key: 'status',
							header: 'Status',
							render: (user: any) => getStatusBadge(user),
						},
					]}
					actions={[
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (user: any) => `${user.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (user: any) => `${user.id}/delete`,
							variant: 'outline' as const,
						},
						{
							label: 'Unlock',
							icon: <LockOpenIcon className="h-4 w-4" />,
							variant: 'outline' as const,
							render: (user: any) =>
								user.status === 'LOCKED' ? unlockAction(user) : null,
						},
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={user => user.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
