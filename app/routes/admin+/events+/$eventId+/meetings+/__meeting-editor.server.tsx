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
import { MeetingDeleteSchema, MeetingEditorSchema } from './__meeting-editor'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: MeetingDeleteSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const meetingToDelete = await prisma.meeting.findUnique({
			where: { id: submission.value.id },
			select: {
				id: true,
				tenantId: true,
				eventId: true,
				meetingType: { select: { name: true } },
				venue: { select: { name: true } },
				event: { select: { name: true } },
			},
		})

		const meeting = await prisma.meeting.delete({
			select: { eventId: true },
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.MEETING,
			entityId: submission.value.id,
			description: `Deleted meeting "${meetingToDelete?.meetingType.name}" at "${meetingToDelete?.venue.name}" from event "${meetingToDelete?.event.name}"`,
			userId: user.id,
			tenantId: meetingToDelete?.tenantId,
			metadata: { meeting: meetingToDelete },
		})

		return redirectWithToast(`/admin/events/${meeting.eventId}/meetings`, {
			type: 'success',
			title: `Meeting Deleted`,
			description: `Meeting deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: MeetingEditorSchema.superRefine(async (data, ctx) => {
			const meeting = await prisma.meeting.findUnique({
				where: {
					tenantId_eventId_meetingTypeId_venueId_accessLevel_startDate_endDate:
						{
							eventId: data.eventId,
							tenantId: data.tenantId,
							meetingTypeId: data.meetingTypeId,
							venueId: data.venueId,
							accessLevel: data.accessLevel,
							startDate: data.startDate,
							endDate: data.endDate,
						},
				},
				select: { id: true },
			})

			if (meeting && meeting.id !== data.id) {
				ctx.addIssue({
					path: [''],
					code: z.ZodIssueCode.custom,
					message:
						'Meeting with this combination of meeting type, venue, access level, start date and end date already exists.',
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

	const { id: meetingId, ...data } = submission.value
	const isUpdate = !!meetingId

	const meeting = await prisma.meeting.upsert({
		select: {
			id: true,
			tenantId: true,
			meetingType: { select: { name: true } },
			venue: { select: { name: true } },
			event: { select: { name: true } },
		},
		where: { id: meetingId ?? '__new_meeting__' },
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
		entityType: AuditEntityType.MEETING,
		entityId: meeting.id,
		description: `${isUpdate ? 'Updated' : 'Created'} meeting "${meeting.meetingType.name}" at "${meeting.venue.name}" for event "${meeting.event.name}"`,
		userId: user.id,
		tenantId: meeting.tenantId,
		metadata: {
			meeting: { id: meeting.id, ...data },
		},
	})

	return redirectWithToast(`/admin/events/${data.eventId}/meetings`, {
		type: 'success',
		title: `Meeting ${isUpdate ? 'Updated' : 'Created'}`,
		description: `Meeting ${isUpdate ? 'updated' : 'created'} successfully.`,
	})
}
