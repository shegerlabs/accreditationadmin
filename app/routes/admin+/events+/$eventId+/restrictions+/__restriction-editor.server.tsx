import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import {
	RestrictionDeleteSchema,
	RestrictionEditorSchema,
} from './__restriction-editor'

export async function action({ request }: ActionFunctionArgs) {
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

		const restriction = await prisma.restriction.delete({
			select: { eventId: true },
			where: { id: submission.value.id },
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
						name: data.name,
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

	const { id: restrictionId, ...data } = submission.value

	await prisma.restriction.upsert({
		where: { id: restrictionId ?? '__new_restriction__' },
		create: {
			...data,
		},
		update: {
			...data,
		},
	})

	return redirectWithToast(`/admin/events/${data.eventId}/restrictions`, {
		type: 'success',
		title: `Restriction ${restrictionId ? 'Updated' : 'Created'}`,
		description: `Restriction ${restrictionId ? 'updated' : 'created'} successfully.`,
	})
}
