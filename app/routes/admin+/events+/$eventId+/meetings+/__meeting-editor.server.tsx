import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import { MeetingDeleteSchema, MeetingEditorSchema } from './__meeting-editor'

export async function action({ request }: ActionFunctionArgs) {
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

		const meeting = await prisma.meeting.delete({
			select: { eventId: true },
			where: { id: submission.value.id },
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

	await prisma.meeting.upsert({
		select: { id: true },
		where: { id: meetingId ?? '__new_meeting__' },
		create: {
			...data,
		},
		update: {
			...data,
		},
	})

	return redirectWithToast(`/admin/events/${data.eventId}/meetings`, {
		type: 'success',
		title: `Meeting ${meetingId ? 'Updated' : 'Created'}`,
		description: `Meeting ${meetingId ? 'updated' : 'created'} successfully.`,
	})
}
