import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { EyeIcon, LockOpenIcon, UserIcon } from 'lucide-react'
import { parseWithZod } from 'node_modules/@conform-to/zod/parse'
import { z } from 'zod'
import { ActionForm } from '~/components/action-form'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

export const UnlockUserSchema = z.object({
	userId: z.string(),
})

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)

	// System seed users that should be hidden from tenant admins
	const SYSTEM_SEED_USERS = [
		'focal',
		'firstvalidator',
		'secondvalidator',
		'badgeprinter',
		'dispatcher',
		'tenantadmin',
	]

	// Parse tenant assignment filter from URL
	const url = new URL(request.url)
	const tenantAssignment = url.searchParams.get('tenantAssignment') ?? 'all'

	// Build the where filter based on user type and tenant assignment filter
	let whereFilter: any = {}

	if (user.isGlobalAdmin) {
		// Global admins see all users, with optional tenant assignment filter
		if (tenantAssignment === 'unassigned') {
			whereFilter = { tenantId: null }
		} else if (tenantAssignment === 'assigned') {
			whereFilter = { tenantId: { not: null } }
		}
		// 'all' = no filter
	} else {
		// Tenant admins see their tenant's users + orphan users
		// But never see system seed users or global admins
		const baseExclusions = {
			username: { notIn: SYSTEM_SEED_USERS },
			NOT: {
				roles: {
					some: {
						name: 'admin',
					},
				},
			},
		}

		if (tenantAssignment === 'mytenant') {
			whereFilter = {
				tenantId: user.tenantId,
				...baseExclusions,
			}
		} else if (tenantAssignment === 'unassigned') {
			whereFilter = {
				tenantId: null,
				...baseExclusions,
			}
		} else {
			// 'all' - show both tenant users and orphans
			whereFilter = {
				OR: [{ tenantId: user.tenantId }, { tenantId: null }],
				...baseExclusions,
			}
		}
	}

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } =
		await filterAndPaginate({
			request,
			model: prisma.user,
			where: whereFilter,
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
				tenantId: true,
				tenant: {
					select: {
						name: true,
					},
				},
			},
		})

	// Global admins see tenant filter dropdown, tenant admins don't need it
	const tenants = user.isGlobalAdmin
		? await prisma.tenant.findMany({
				select: {
					id: true,
					name: true,
				},
			})
		: []

	// Get max lock count setting
	const maxLockCount = await getSetting<number>(SettingKeys.AUTH_MAX_LOCK_COUNT)

	return json({
		status: 'idle',
		tenants,
		users: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		isGlobalAdmin: user.isGlobalAdmin,
		maxLockCount,
	} as const)
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
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
		// Validate tenant access for the target user
		// Tenant admins can unlock their own tenant's users or orphan users
		const targetUser = await prisma.user.findFirst({
			where: user.isGlobalAdmin
				? { id: userId }
				: {
						id: userId,
						OR: [{ tenantId: user.tenantId }, { tenantId: null }],
					},
			select: {
				id: true,
				status: true,
				lockCount: true,
			},
		})
		invariantResponse(targetUser, 'User not found', { status: 404 })

		// Get max lock count setting
		const maxLockCount = await getSetting<number>(
			SettingKeys.AUTH_MAX_LOCK_COUNT,
		)
		const isPermanentlyLocked =
			targetUser.status === 'LOCKED' && targetUser.lockCount >= maxLockCount

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

export default function UsersRoute() {
	const data = useLoaderData<typeof loader>()
	const {
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		isGlobalAdmin,
		maxLockCount,
	} = data

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
			user.status === 'LOCKED' && user.lockCount >= maxLockCount

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
						autoSubmit={true}
						filters={[
							// Tenant assignment filter
							{
								name: 'tenantAssignment',
								label: 'Tenant',
								type: 'select' as const,
								options: isGlobalAdmin
									? [
											{ value: 'all', label: 'All Users' },
											{ value: 'assigned', label: 'Assigned to Tenant' },
											{ value: 'unassigned', label: 'Unassigned' },
										]
									: [
											{ value: 'all', label: 'All Users' },
											{ value: 'mytenant', label: 'My Tenant' },
											{ value: 'unassigned', label: 'Unassigned' },
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
					columns={[
						{
							key: 'name',
							header: 'Username',
							render: (user: any) => (
								<Link
									to={`/admin/users/${user.id}`}
									className="flex items-center space-x-2"
								>
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{user.username}</span>
								</Link>
							),
						},
						{ key: 'email', header: 'Email' },
						{
							key: 'tenant',
							header: 'Tenant',
							render: (user: any) =>
								user.tenant ? (
									<span>{user.tenant.name}</span>
								) : (
									<span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
										Unassigned
									</span>
								),
						},
						{
							key: 'status',
							header: 'Status',
							render: (user: any) => getStatusBadge(user),
						},
					]}
					actions={[
						{
							label: 'View',
							icon: <EyeIcon className="h-4 w-4" />,
							href: (user: any) => `${user.id}`,
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
					
					keyExtractor={user => user.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			</div>
		</div>
	)
}
