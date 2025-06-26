import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import {
	PermissionDeleteSchema,
	PermissionEditorSchema,
} from './__permission-editor'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
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

		const permission = await prisma.permission.delete({
			where: { id: submission.value.id },
			select: { id: true, action: true, entity: true, access: true },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.PERMISSION,
			entityId: submission.value.id,
			description: 'Permission deleted',
			userId: user.id,
			metadata: {
				permission,
			},
		})

		return redirectWithToast('/admin/permissions', {
			type: 'success',
			title: `Permission Deleted`,
			description: `Permission deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: PermissionEditorSchema.superRefine(async (data, ctx) => {
			const permission = await prisma.permission.findFirst({
				where: {
					action: data.action,
					entity: data.entity,
					access: data.access,
				},
				select: { id: true },
			})

			if (permission && permission.id !== data.id) {
				ctx.addIssue({
					path: ['action'],
					code: z.ZodIssueCode.custom,
					message:
						'Permission with this action, entity, and access already exists.',
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

	const { id: permissionId, action, entity, access } = submission.value

	const data = {
		action,
		entity,
		access,
	}

	await prisma.permission.upsert({
		select: { id: true },
		where: { id: permissionId ?? '__new_permission__' },
		create: {
			...data,
		},
		update: {
			...data,
		},
	})

	const auditAction = permissionId ? AuditAction.UPDATE : AuditAction.CREATE
	const entityType = AuditEntityType.PERMISSION
	const entityId = permissionId
	const auditDescription = permissionId
		? 'Permission updated'
		: 'Permission created'
	await auditRequest({
		request,
		action: auditAction,
		entityType,
		entityId,
		description: auditDescription,
		userId: user.id,
		metadata: {
			permission: {
				id: permissionId,
				...data,
			},
		},
	})

	return redirectWithToast('/admin/permissions', {
		type: 'success',
		title: `Permission ${permissionId ? 'Updated' : 'Created'}`,
		description: `Permission ${permissionId ? 'updated' : 'created'} successfully.`,
	})
}
