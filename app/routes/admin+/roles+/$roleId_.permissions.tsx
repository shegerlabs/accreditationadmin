import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { TrashIcon, UserIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { z } from 'zod'
import { ActionForm } from '~/components/action-form'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserId, requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

export const PermissionDeleteSchema = z.object({
	roleId: z.string(),
	permissionId: z.string(),
})

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { roleId } = params
	const url = new URL(request.url)
	const searchParams = url.searchParams || {}
	const filters: Record<string, string> = {}
	const filterFields = ['action', 'entity', 'access']
	filterFields.forEach(param => {
		const value = searchParams.get(param)
		if (value && value !== 'all') {
			filters[param] = value
		}
	})

	const search = searchParams.get('search')
	if (search) {
		filters.entity = {
			contains: search,
			mode: 'insensitive' as const,
		} as any
	}

	invariantResponse(roleId, 'Role ID is required', { status: 404 })
	const role = await prisma.role.findUnique({
		where: { id: roleId },
		include: {
			permissions: {
				select: {
					id: true,
					action: true,
					entity: true,
					access: true,
				},
				where: Object.keys(filters).length ? filters : undefined,
			},
		},
	})
	invariantResponse(role, 'Role not found', { status: 404 })

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
		role,
		entities,
		actions,
		access,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	const submission = await parseWithZod(formData, {
		schema: PermissionDeleteSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { roleId, permissionId } = submission.value

	if (intent === 'delete') {
		const role = await prisma.role.findUnique({
			where: { id: roleId },
			include: {
				permissions: true,
			},
		})
		invariantResponse(role, 'Role not found', { status: 404 })

		const updatedPermissions = role.permissions.filter(
			p => p.id !== permissionId,
		)
		await prisma.role.update({
			where: { id: roleId },
			data: {
				permissions: {
					set: updatedPermissions,
				},
			},
		})
	}

	throw await redirectWithToast(`/admin/roles/${roleId}/permissions`, {
		type: 'success',
		title: 'Permission Deleted',
		description: 'The permission has been deleted',
	})
}

export default function IndexRoute() {
	const { role, entities, actions, access } = useLoaderData<typeof loader>()
	const isMobile = useMediaQuery({ maxWidth: 767 })

	const deleteAction = (permission: any) => (
		<ActionForm
			method="POST"
			data={{
				roleId: role.id,
				permissionId: permission.id,
			}}
			buttonContent={<TrashIcon className="h-4 w-4" />}
			buttonVariant="destructive"
			buttonSize="sm"
			intent="delete"
		/>
	)

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-4 divide-dotted border-b pb-2 text-base font-semibold leading-6 text-gray-500">
					Permissions for {role.name}
				</div>
				<div className="mb-6">
					<SearchBar
						status="idle"
						action={`/admin/roles/${role.id}/permissions`}
						autoSubmit={false}
						filters={[
							{
								name: 'entity',
								label: 'Entity',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...entities.map(entity => ({
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
									...actions.map(action => ({
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
									...access.map(access => ({
										value: access.access,
										label: access.access,
									})),
								],
							},
						]}
					/>
				</div>
				<DataList
					data={role.permissions}
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
					]}
					actions={[
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							variant: 'outline' as const,
							render: (permission: any) => deleteAction(permission),
						},
					]}
					status="idle"
					isMobile={isMobile}
					keyExtractor={permission => permission.id}
				/>
			</div>
		</div>
	)
}
