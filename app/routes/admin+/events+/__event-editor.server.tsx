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
import { EventDeleteSchema, EventEditorSchema } from './__event-editor'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: EventDeleteSchema,
			async: true,
		})
		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}
		const event = await prisma.event.delete({
			where: { id: submission.value.id },
			select: {
				id: true,
				name: true,
				startDate: true,
				endDate: true,
				tenantId: true,
				description: true,
				status: true,
				createdAt: true,
				updatedAt: true,
				meetings: true,
				restrictions: true,
				workflows: true,
				invitations: true,
				participants: true,
				templates: true,
			},
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.EVENT,
			entityId: submission.value.id,
			description: 'Event deleted',
			userId: user.id,
			metadata: {
				event,
			},
		})

		return redirectWithToast('/admin/events', {
			type: 'success',
			title: `Event Deleted`,
			description: `Event deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: EventEditorSchema.superRefine(async (data, ctx) => {
			const event = await prisma.event.findFirst({
				where: { name: data.name },
				select: { id: true },
			})

			if (event && event.id !== data.id) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message: 'Event with this name already exists.',
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

	const { id: eventId, ...data } = submission.value

	await prisma.event.upsert({
		select: { id: true },
		where: { id: eventId ?? '__new_event__' },
		create: {
			...data,
			status: 'DRAFT',
		},
		update: {
			...data,
		},
	})

	const action = eventId ? AuditAction.UPDATE : AuditAction.CREATE
	const entityType = AuditEntityType.EVENT
	const entityId = eventId
	const description = eventId ? 'Event updated' : 'Event created'
	await auditRequest({
		request,
		action,
		entityType,
		entityId,
		description,
		userId: user.id,
		metadata: {
			event: {
				id: eventId,
				...data,
			},
		},
	})

	return redirectWithToast('/admin/events', {
		type: 'success',
		title: `Event ${eventId ? 'Updated' : 'Created'}`,
		description: `Event ${eventId ? 'updated' : 'created'} successfully.`,
	})
}
