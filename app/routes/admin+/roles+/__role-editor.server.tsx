import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType, Prisma } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { invalidateCache } from '~/utils/cache.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import { RoleDeleteSchema, RoleEditorSchema } from './__role-editor'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: RoleDeleteSchema,
			async: true,
		})
		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const role = await prisma.role
			.delete({
				select: { id: true, name: true, description: true },
				where: { id: submission.value.id },
			})
			// Step's participant and approval foreign keys are NO ACTION, so this
			// fails instead of cascading into participants and approval history.
			.catch((error: unknown) => {
				if (
					error instanceof Prisma.PrismaClientKnownRequestError &&
					error.code === 'P2003'
				)
					return null
				throw error
			})
		if (!role) {
			return redirectWithToast('/admin/roles', {
				type: 'error',
				title: 'Cannot Delete',
				description:
					'Workflow steps that hold participants or approval history use this role, so it can’t be deleted.',
			})
		}

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.ROLE,
			entityId: submission.value.id,
			description: 'Role deleted',
			userId: user.id,
			metadata: {
				role,
			},
		})

		invalidateCache('roles')

		return redirectWithToast('/admin/roles', {
			type: 'success',
			title: `Role Deleted`,
			description: `Role deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: RoleEditorSchema.superRefine(async (data, ctx) => {
			const role = await prisma.role.findFirst({
				where: { name: data.name },
				select: { id: true },
			})

			if (role && role.id !== data.id) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message: 'Role with this name already exists.',
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

	const { id: roleId, name, description } = submission.value

	const data = {
		name,
		description,
	}

	await prisma.role.upsert({
		select: { id: true },
		where: { id: roleId ?? '__new_role__' },
		create: {
			...data,
		},
		update: {
			...data,
		},
	})

	const action = roleId ? AuditAction.UPDATE : AuditAction.CREATE
	const entityType = AuditEntityType.ROLE
	const entityId = roleId
	const auditDescription = roleId ? 'Role updated' : 'Role created'
	await auditRequest({
		request,
		action,
		entityType,
		entityId,
		description: auditDescription,
		userId: user.id,
		metadata: {
			role: {
				id: roleId,
				...data,
			},
		},
	})

	invalidateCache('roles')

	return redirectWithToast('/admin/roles', {
		type: 'success',
		title: `Role ${roleId ? 'Updated' : 'Created'}`,
		description: `Role ${roleId ? 'updated' : 'created'} successfully.`,
	})
}
