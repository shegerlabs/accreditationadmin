import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { auditRequest } from '~/utils/audit.server'
import { getPasswordHash, requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import { UserDeleteSchema, UserEditorSchema } from './__user-editor'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin'])

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

		const user = await prisma.user.delete({
			select: { id: true, name: true, email: true, username: true },
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.USER,
			entityId: submission.value.id,
			description: 'User deleted',
			userId: user.id,
			metadata: {
				user,
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
		roles,
		password,
	} = submission.value

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
		userId: user.id,
		metadata: {
			user: {
				id: userId,
				...data,
			},
		},
	})

	return redirectWithToast('/admin/users', {
		type: 'success',
		title: `User ${userId ? 'Updated' : 'Created'}`,
		description: `User ${userId ? 'updated' : 'created'} successfully.`,
	})
}
