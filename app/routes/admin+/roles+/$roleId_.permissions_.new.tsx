import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import { useActionData, useLoaderData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxGroupField } from '~/components/conform/CheckboxGroupField'
import { InputField } from '~/components/conform/InputField'
import { FormCard } from '~/components/form-card'
import { SearchBar } from '~/components/search-bar'
import { requireUserId } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
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
			},
		},
	})

	invariantResponse(role, 'Role not found', { status: 404 })

	const permissions = await prisma.permission.findMany({
		select: {
			id: true,
			action: true,
			entity: true,
			access: true,
		},
		where: {
			AND: {
				id: {
					notIn: role.permissions.map(p => p.id),
				},
				...filters,
			},
		},
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
		role,
		permissions,
		entities,
		actions,
		access,
	})
}

export const PermissionEditorSchema = z.object({
	roleId: z.string(),
	permissions: z.array(z.string()),
})

export async function action({ request }: ActionFunctionArgs) {
	await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: PermissionEditorSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { roleId, permissions } = submission.value

	const role = await prisma.role.findUnique({
		where: { id: roleId },
		include: {
			permissions: true,
		},
	})
	invariantResponse(role, 'Role not found', { status: 404 })

	await prisma.role.update({
		where: { id: roleId },
		data: {
			permissions: {
				connect: permissions.map(permission => ({ id: permission })),
			},
		},
	})

	throw await redirectWithToast(`/admin/roles/${roleId}/permissions`, {
		type: 'success',
		title: 'Permissions Added',
		description: 'The permission has been added',
	})
}

export default function AddPermissionRoute() {
	const { role, permissions, entities, actions, access } =
		useLoaderData<typeof loader>()

	const actionData = useActionData<typeof action>()
	const schema = PermissionEditorSchema
	const [form, fields] = useForm({
		id: 'register-permission',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			roleId: role.id,
			permissions: [],
		},
	})

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status="idle"
						action={`/admin/roles/${role.id}/permissions/new`}
						autoSubmit={false}
						showAddButton={false}
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

				{permissions.length > 0 ? (
					<FormCard
						title={`Select Permissions for ${role.name}`}
						formId={form.id}
						onSubmit={form.onSubmit}
						buttons={[
							{
								label: 'Save',
								intent: 'add',
								variant: 'default',
								type: 'submit',
							},
							{
								label: 'Cancel',
								to: `/admin/roles/${role.id}/permissions`,
								type: 'link',
							},
						]}
					>
						<AuthenticityTokenInput />
						<HoneypotInputs />
						<InputField meta={fields.roleId} type="hidden" />
						<CheckboxGroupField
							meta={fields.permissions}
							items={permissions.map(permission => ({
								name: permission.entity,
								Entity: permission.action,
								Access: permission.access,
								value: permission.id,
							}))}
						/>
					</FormCard>
				) : (
					<div className="divide-dotted border py-2 text-center">
						<h3 className="mt-2 text-sm font-semibold text-muted-foreground">
							No permissions found. Could be that all permissions have already
							been added.
						</h3>
					</div>
				)}
			</div>
		</div>
	)
}
