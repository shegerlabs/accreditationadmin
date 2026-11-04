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
import { VenueDeleteSchema, VenueEditorSchema } from './__venue-editor'

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])

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

		const venueToDelete = await prisma.venue.findUnique({
			where: { id: submission.value.id },
			select: { id: true, name: true, tenantId: true },
		})

		await prisma.venue.delete({
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.VENUE,
			entityId: submission.value.id,
			description: `Deleted venue "${venueToDelete?.name}"`,
			userId: user.id,
			tenantId: venueToDelete?.tenantId || tenantId,
			metadata: { venue: venueToDelete },
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

	const { id: venueId, name, description, address, city, state, zip, country, capacity, ...data } = submission.value
	const isUpdate = !!venueId

	const venue = await prisma.venue.upsert({
		select: { id: true, name: true, tenantId: true },
		where: { id: venueId ?? '__new_venue__' },
		create: {
			...data,
			name: name!,
			description: description!,
			address: address!,
			city: city!,
			state: state!,
			zip: zip!,
			country: country!,
			capacity: Number(capacity),
			latitude: Number(data.latitude ?? 0),
			longitude: Number(data.longitude ?? 0),
		},
		update: {
			...data,
			name: name!,
			description: description!,
			address: address!,
			city: city!,
			state: state!,
			zip: zip!,
			country: country!,
			capacity: Number(capacity),
			latitude: Number(data.latitude ?? 0),
			longitude: Number(data.longitude ?? 0),
		},
	})

	await auditRequest({
		request,
		action: isUpdate ? AuditAction.UPDATE : AuditAction.CREATE,
		entityType: AuditEntityType.VENUE,
		entityId: venue.id,
		description: `${isUpdate ? 'Updated' : 'Created'} venue "${name}"`,
		userId: user.id,
		tenantId: venue.tenantId || tenantId,
		metadata: {
			venue: { id: venue.id, name, description, address, city, state, zip, country, capacity },
		},
	})

	return redirectWithToast(`/admin/tenants/${tenantId}/venues`, {
		type: 'success',
		title: `Venue ${isUpdate ? 'Updated' : 'Created'}`,
		description: `Venue ${isUpdate ? 'updated' : 'created'} successfully.`,
	})
}
