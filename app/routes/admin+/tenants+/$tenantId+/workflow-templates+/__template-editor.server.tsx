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
import { TemplateDeleteSchema, TemplateEditorSchema } from './__template-editor'

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])

	const { tenantId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: TemplateDeleteSchema,
			async: true,
		})
		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const templateToDelete = await prisma.workflowTemplate.findUnique({
			where: { id: submission.value.id },
			select: { id: true, name: true, tenantId: true },
		})

		await prisma.workflowTemplate.delete({
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.TEMPLATE,
			entityId: submission.value.id,
			description: `Deleted workflow template "${templateToDelete?.name}"`,
			userId: user.id,
			tenantId: templateToDelete?.tenantId || tenantId,
			metadata: {
				template: templateToDelete,
			},
		})

		return redirectWithToast(
			`/admin/tenants/${tenantId}/workflow-templates`,
			{
				type: 'success',
				title: 'Template Deleted',
				description: 'Workflow template deleted successfully.',
			},
		)
	}

	const submission = await parseWithZod(formData, {
		schema: TemplateEditorSchema.superRefine(async (data, ctx) => {
			const existingTemplate = await prisma.workflowTemplate.findUnique({
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
					message: 'A template with this name already exists.',
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

	const template = await prisma.workflowTemplate.upsert({
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
		entityType: AuditEntityType.TEMPLATE,
		entityId: template.id,
		description: `${isUpdate ? 'Updated' : 'Created'} workflow template "${template.name}"`,
		userId: user.id,
		tenantId: template.tenantId || tenantId,
		metadata: {
			template: {
				id: template.id,
				...data,
			},
		},
	})

	// Redirect to list on creation, to steps on update
	const redirectUrl = isUpdate
		? `/admin/tenants/${tenantId}/workflow-templates/${template.id}/steps`
		: `/admin/tenants/${tenantId}/workflow-templates`

	return redirectWithToast(
		redirectUrl,
		{
			type: 'success',
			title: `Template ${isUpdate ? 'Updated' : 'Created'}`,
			description: `Workflow template ${isUpdate ? 'updated' : 'created'} successfully.`,
		},
	)
}
