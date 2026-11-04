import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { auditRequest } from '~/utils/audit.server'
import { getPasswordHash, requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import { UserDeleteSchema, UserEditorSchema } from './__user-editor'

export async function action({ request }: ActionFunctionArgs) {
	const currentUser = await requireAdminAccess(request)

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: UserDeleteSchema,
			async: true,
		})
		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const deletedUser = await prisma.user.delete({
			select: { id: true, name: true, email: true, username: true, tenantId: true },
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.USER,
			entityId: submission.value.id,
			description: 'User deleted',
			userId: currentUser.id,
			tenantId: deletedUser.tenantId,
			metadata: {
				user: deletedUser,
			},
		})

		return redirectWithToast('/admin/users', {
			type: 'success',
			title: `User Deleted`,
			description: `User deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: UserEditorSchema.superRefine(async (data, ctx) => {
			const user = await prisma.user.findUnique({
				where: { email: data.email },
				select: { id: true },
			})

			if (user && user.id !== data.id) {
				ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: 'User with this email already exists.',
				})
				return
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const {
		id: userId,
		name,
		email,
		username,
		roles: submittedRoles,
		password,
		tenantId: submittedTenantId,
	} = submission.value

	// Get the 'user' role - this is the default role for all users
	const userRole = await prisma.role.findUnique({
		where: { name: 'user' },
		select: { id: true },
	})

	let roles = submittedRoles

	// Ensure 'user' role is always included for all users (create and update)
	if (userRole && !roles.includes(userRole.id)) {
		roles = [userRole.id, ...roles]
	}

	// For tenant admins: validate they can only assign these roles
	// Also preserve any roles they cannot modify (like 'tenant', 'admin', etc.)
	if (!currentUser.isGlobalAdmin) {
		const allowedRoles = await prisma.role.findMany({
			where: { name: { in: ['user', 'focal', 'validator', 'printer', 'dispatcher', 'checkpoint'] } },
			select: { id: true },
		})
		const allowedRoleIds = new Set(allowedRoles.map(r => r.id))

		// Check if tenant admin is trying to assign disallowed roles
		if (roles.length > 0) {
			const hasDisallowedRole = roles.some(
				roleId => roleId && !allowedRoleIds.has(roleId),
			)

			if (hasDisallowedRole) {
				return json(
					{
						result: submission.reply({
							formErrors: ['You do not have permission to assign this role'],
						}),
					},
					{ status: 403 },
				)
			}
		}

		// For existing users, preserve roles that tenant admin cannot modify
		if (userId) {
			const existingUser = await prisma.user.findUnique({
				where: { id: userId },
				select: { roles: { select: { id: true } } },
			})

			if (existingUser) {
				// Get roles that are NOT in the allowed list (these should be preserved)
				const preservedRoles = existingUser.roles
					.filter(r => !allowedRoleIds.has(r.id))
					.map(r => r.id)

				// Merge preserved roles with submitted roles
				roles = [...new Set([...roles, ...preservedRoles])]
			}
		}
	}

	// Determine tenantId:
	// - Global admins can set any tenantId (or null for no tenant)
	// - Tenant admins creating new users: always assign their own tenantId
	// - Tenant admins editing orphan users: can assign their tenant or keep unassigned
	// Note: '__none__' is used as a placeholder value for "No Tenant" in the UI
	let tenantId: string | null = null

	if (currentUser.isGlobalAdmin) {
		// Global admin: use submitted value or null if '__none__'
		tenantId = submittedTenantId && submittedTenantId !== '__none__'
			? submittedTenantId
			: null
	} else {
		// Tenant admin
		if (userId) {
			// Editing existing user - check if it's an orphan user
			const existingUser = await prisma.user.findUnique({
				where: { id: userId },
				select: { tenantId: true },
			})

			if (existingUser?.tenantId === null) {
				// Editing orphan user - tenant admin can assign their tenant or keep unassigned
				if (submittedTenantId && submittedTenantId !== '__none__') {
					// Validate that tenant admin can only assign their own tenant
					if (submittedTenantId !== currentUser.tenantId) {
						return json(
							{
								result: submission.reply({
									formErrors: ['You can only assign users to your own tenant'],
								}),
							},
							{ status: 403 },
						)
					}
					tenantId = submittedTenantId
				} else {
					tenantId = null // Keep unassigned
				}
			} else {
				// Editing their own tenant's user - keep existing tenant
				tenantId = existingUser?.tenantId ?? currentUser.tenantId
			}
		} else {
			// Creating new user - always assign tenant admin's tenant
			tenantId = currentUser.tenantId
		}
	}

	const data = {
		name,
		email,
		username,
		roles: {
			set: roles.map(role => ({ id: role })),
		},
	}

	await prisma.$transaction(async tx => {
		if (userId) {
			// Update existing user
			await tx.user.update({
				where: { id: userId },
				data: {
					...data,
					// Include tenantId in update (already validated above)
					tenantId,
					...(password
						? {
								password: {
									upsert: {
										create: { hash: await getPasswordHash(password) },
										update: { hash: await getPasswordHash(password) },
									},
								},
							}
						: {}),
				},
			})
		} else {
			// Create new user
			await tx.user.create({
				data: {
					...data,
					tenantId,
					roles: {
						connect: roles.map(role => ({ id: role })),
					},
					...(password
						? {
								password: {
									create: { hash: await getPasswordHash(password) },
								},
							}
						: {}),
				},
			})
		}
	})

	const action = userId ? AuditAction.UPDATE : AuditAction.CREATE
	const entityType = AuditEntityType.USER
	const entityId = userId
	const description = userId ? 'User updated' : 'User created'
	await auditRequest({
		request,
		action,
		entityType,
		entityId,
		description,
		userId: currentUser.id,
		tenantId,
		metadata: {
			user: {
				id: userId,
				...data,
				tenantId,
			},
		},
	})

	// For edit, redirect to user detail page; for create, redirect to users list
	const redirectUrl = userId ? `/admin/users/${userId}` : '/admin/users'

	return redirectWithToast(redirectUrl, {
		type: 'success',
		title: `User ${userId ? 'Updated' : 'Created'}`,
		description: `User ${userId ? 'updated' : 'created'} successfully.`,
	})
}
