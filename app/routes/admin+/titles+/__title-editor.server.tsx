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
import { TitleDeleteSchema, TitleEditorSchema } from './__title-editor'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: TitleDeleteSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const deletedTitle = await prisma.title.delete({
			select: { id: true, name: true },
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.TITLE,
			entityId: submission.value.id,
			description: 'Title deleted',
			userId: user.id,
			metadata: {
				title: deletedTitle,
			},
		})

		return redirectWithToast('/admin/titles', {
			type: 'success',
			title: 'Title Deleted',
			description: 'Title has been deleted successfully.',
		})
	}

	const submission = await parseWithZod(formData, {
		schema: TitleEditorSchema.superRefine(async (data, ctx) => {
			if (!data.name) return
			const existingTitle = await prisma.title.findFirst({
				where: {
					name: data.name,
					NOT: data.id ? { id: data.id } : undefined,
				},
				select: { id: true },
			})

			if (existingTitle) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message: 'A title with this name already exists.',
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

	const { id: titleId, name } = submission.value

	const titleName = name!

	const title = await prisma.title.upsert({
		select: { id: true, name: true },
		where: { id: titleId ?? '__new_title__' },
		create: {
			name: titleName,
		},
		update: {
			name: titleName,
		},
	})

	const auditAction = titleId ? AuditAction.UPDATE : AuditAction.CREATE
	const entityType = AuditEntityType.TITLE
	const entityId = title.id
	const description = titleId ? 'Title updated' : 'Title created'

	await auditRequest({
		request,
		action: auditAction,
		entityType,
		entityId,
		description,
		userId: user.id,
		metadata: {
			title,
		},
	})

	return redirectWithToast('/admin/titles', {
		type: 'success',
		title: titleId ? 'Title Updated' : 'Title Created',
		description: titleId
			? 'Title has been updated successfully.'
			: 'Title has been created successfully.',
	})
}
