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
import { BadgeTemplateDeleteSchema, BadgeTemplateEditorSchema } from './__badge-template-editor'

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])

	const { tenantId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: BadgeTemplateDeleteSchema,
			async: true,
		})
		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		// Check if any templates are using this badge template
		const usageCount = await prisma.template.count({
			where: { badgeTemplateId: submission.value.id },
		})

		if (usageCount > 0) {
			return json(
				{
					result: submission.reply({
						formErrors: [`Cannot delete: ${usageCount} event template(s) are using this badge design. Please reassign them first.`],
					}),
				},
				{ status: 400 },
			)
		}

		const templateToDelete = await prisma.badgeTemplate.findUnique({
			where: { id: submission.value.id },
			select: { id: true, name: true, tenantId: true },
		})

		await prisma.badgeTemplate.delete({
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.BADGE_TEMPLATE,
			entityId: submission.value.id,
			description: `Deleted badge template "${templateToDelete?.name}"`,
			userId: user.id,
			tenantId: templateToDelete?.tenantId || tenantId,
			metadata: {
				template: templateToDelete,
			},
		})

		return redirectWithToast(
			`/admin/tenants/${tenantId}/badge-templates`,
			{
				type: 'success',
				title: 'Template Deleted',
				description: 'Badge template deleted successfully.',
			},
		)
	}

	const submission = await parseWithZod(formData, {
		schema: BadgeTemplateEditorSchema.superRefine(async (data, ctx) => {
			const existingTemplate = await prisma.badgeTemplate.findUnique({
				where: {
					tenantId_name: {
						tenantId: data.tenantId,
						name: data.name,
					},
				},
				select: { id: true },
			})

			if (existingTemplate && existingTemplate.id !== data.id) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message: 'A badge template with this name already exists.',
				})
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

	const { id: templateId, ...data } = submission.value
	const isUpdate = !!templateId

	// If setting as default, unset other defaults for this tenant
	if (data.isDefault) {
		await prisma.badgeTemplate.updateMany({
			where: { tenantId: data.tenantId, isDefault: true },
			data: { isDefault: false },
		})
	}

	const template = await prisma.badgeTemplate.upsert({
		select: { id: true, name: true, tenantId: true },
		where: { id: templateId ?? '__new_template__' },
		create: {
			...data,
		},
		update: {
			...data,
		},
	})

	await auditRequest({
		request,
		action: isUpdate ? AuditAction.UPDATE : AuditAction.CREATE,
		entityType: AuditEntityType.BADGE_TEMPLATE,
		entityId: template.id,
		description: `${isUpdate ? 'Updated' : 'Created'} badge template "${template.name}"`,
		userId: user.id,
		tenantId: template.tenantId || tenantId,
		metadata: {
			template: {
				id: template.id,
				...data,
			},
		},
	})

	return redirectWithToast(
		`/admin/tenants/${tenantId}/badge-templates`,
		{
			type: 'success',
			title: `Template ${isUpdate ? 'Updated' : 'Created'}`,
			description: `Badge template ${isUpdate ? 'updated' : 'created'} successfully.`,
		},
	)
}
