import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import {
	MeetingTypeDeleteSchema,
	MeetingTypeEditorSchema,
} from './__meeting-type-editor'

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { tenantId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: MeetingTypeDeleteSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		await prisma.meetingType.delete({
			where: { id: submission.value.id },
		})

		return redirectWithToast(`/admin/tenants/${tenantId}/meeting-types`, {
			type: 'success',
			title: `Meeting Type Deleted`,
			description: `Meeting Type deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: MeetingTypeEditorSchema.superRefine(async (data, ctx) => {
			const meetingType = await prisma.meetingType.findFirst({
				where: { name: data.name },
				select: { id: true },
			})

			if (meetingType && meetingType.id !== data.id) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message: 'Meeting type with this name already exists.',
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

	const { id: meetingTypeId, ...data } = submission.value

	await prisma.meetingType.upsert({
		select: { id: true },
		where: { id: meetingTypeId ?? '__new_meeting_type__' },
		create: {
			...data,
		},
		update: {
			...data,
		},
	})

	return redirectWithToast(`/admin/tenants/${tenantId}/meeting-types`, {
		type: 'success',
		title: `Meeting Type ${meetingTypeId ? 'Updated' : 'Created'}`,
		description: `Meeting Type ${meetingTypeId ? 'updated' : 'created'} successfully.`,
	})
}
