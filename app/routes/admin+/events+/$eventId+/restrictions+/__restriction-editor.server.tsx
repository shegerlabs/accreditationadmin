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
	RestrictionDeleteSchema,
	RestrictionEditorSchema,
} from './__restriction-editor'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: RestrictionDeleteSchema,
			async: true,
		})
		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const restrictionToDelete = await prisma.restriction.findUnique({
			where: { id: submission.value.id },
			select: { id: true, name: true, eventId: true, tenantId: true, event: { select: { name: true } } },
		})

		const restriction = await prisma.restriction.delete({
			select: { eventId: true },
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.RESTRICTION,
			entityId: submission.value.id,
			description: `Deleted restriction "${restrictionToDelete?.name}" from event "${restrictionToDelete?.event.name}"`,
			userId: user.id,
			tenantId: restrictionToDelete?.tenantId,
			metadata: { restriction: restrictionToDelete },
		})

		return redirectWithToast(
			`/admin/events/${restriction.eventId}/restrictions`,
			{
				type: 'success',
				title: `Restriction Deleted`,
				description: `Restriction deleted successfully.`,
			},
		)
	}

	const submission = await parseWithZod(formData, {
		schema: RestrictionEditorSchema.superRefine(async (data, ctx) => {
			const restriction = await prisma.restriction.findUnique({
				where: {
					tenantId_eventId_name: {
						eventId: data.eventId,
						tenantId: data.tenantId,
						name: data.name ?? '',
					},
				},
				select: { id: true },
			})

			if (restriction && restriction.id !== data.id) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message: 'Restriction with this name already exists.',
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

	const { id: restrictionId, name, ...data } = submission.value
	const isUpdate = !!restrictionId

	const restriction = await prisma.restriction.upsert({
		select: { id: true, name: true, tenantId: true, event: { select: { name: true } } },
		where: { id: restrictionId ?? '__new_restriction__' },
		create: {
			...data,
			name: name!,
		},
		update: {
			...data,
			name: name!,
		},
	})

	await auditRequest({
		request,
		action: isUpdate ? AuditAction.UPDATE : AuditAction.CREATE,
		entityType: AuditEntityType.RESTRICTION,
		entityId: restriction.id,
		description: `${isUpdate ? 'Updated' : 'Created'} restriction "${name}" for event "${restriction.event.name}"`,
		userId: user.id,
		tenantId: restriction.tenantId,
		metadata: {
			restriction: { id: restriction.id, name, ...data },
		},
	})

	return redirectWithToast(`/admin/events/${data.eventId}/restrictions`, {
		type: 'success',
		title: `Restriction ${isUpdate ? 'Updated' : 'Created'}`,
		description: `Restriction ${isUpdate ? 'updated' : 'created'} successfully.`,
	})
}
