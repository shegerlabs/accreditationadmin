import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import { VenueDeleteSchema, VenueEditorSchema } from './__venue-editor'

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { tenantId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: VenueDeleteSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		await prisma.venue.delete({
			where: { id: submission.value.id },
		})

		return redirectWithToast(`/admin/tenants/${tenantId}/venues`, {
			type: 'success',
			title: `Venue Deleted`,
			description: `Venue deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: VenueEditorSchema.superRefine(async (data, ctx) => {
			const venue = await prisma.venue.findFirst({
				where: { name: data.name },
				select: { id: true },
			})

			if (venue && venue.id !== data.id) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message: 'Venue with this name already exists.',
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

	const { id: venueId, ...data } = submission.value

	await prisma.venue.upsert({
		select: { id: true },
		where: { id: venueId ?? '__new_venue__' },
		create: {
			...data,
			capacity: Number(data.capacity),
			latitude: Number(data.latitude),
			longitude: Number(data.longitude),
		},
		update: {
			...data,
			capacity: Number(data.capacity),
			latitude: Number(data.latitude),
			longitude: Number(data.longitude),
		},
	})

	return redirectWithToast(`/admin/tenants/${tenantId}/venues`, {
		type: 'success',
		title: `Venue ${venueId ? 'Updated' : 'Created'}`,
		description: `Venue ${venueId ? 'updated' : 'created'} successfully.`,
	})
}
