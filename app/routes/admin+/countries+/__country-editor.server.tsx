import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { invalidateCache } from '~/utils/cache.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import { CountryDeleteSchema, CountryEditorSchema } from './__country-editor'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: CountryDeleteSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const deletedCountry = await prisma.country.delete({
			select: { id: true, name: true, code: true },
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.COUNTRY,
			entityId: submission.value.id,
			description: 'Country deleted',
			userId: user.id,
			metadata: {
				country: deletedCountry,
			},
		})

		invalidateCache('countries')

		return redirectWithToast('/admin/countries', {
			type: 'success',
			title: 'Country Deleted',
			description: 'Country has been deleted successfully.',
		})
	}

	const submission = await parseWithZod(formData, {
		schema: CountryEditorSchema.superRefine(async (data, ctx) => {
			if (!data.code) return
			const existingCountry = await prisma.country.findFirst({
				where: {
					code: data.code.toUpperCase(),
					NOT: data.id ? { id: data.id } : undefined,
				},
				select: { id: true },
			})

			if (existingCountry) {
				ctx.addIssue({
					path: ['code'],
					code: z.ZodIssueCode.custom,
					message: 'A country with this code already exists.',
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

	const { id: countryId, name, code } = submission.value

	// Name and code are validated and required by the schema
	const countryName = name!
	const countryCode = code!.toUpperCase()

	const country = await prisma.country.upsert({
		select: { id: true, name: true, code: true },
		where: { id: countryId ?? '__new_country__' },
		create: {
			name: countryName,
			code: countryCode,
		},
		update: {
			name: countryName,
			code: countryCode,
		},
	})

	const auditAction = countryId ? AuditAction.UPDATE : AuditAction.CREATE
	const entityType = AuditEntityType.COUNTRY
	const entityId = country.id
	const description = countryId ? 'Country updated' : 'Country created'

	await auditRequest({
		request,
		action: auditAction,
		entityType,
		entityId,
		description,
		userId: user.id,
		metadata: {
			country,
		},
	})

	invalidateCache('countries')

	return redirectWithToast('/admin/countries', {
		type: 'success',
		title: countryId ? 'Country Updated' : 'Country Created',
		description: countryId
			? 'Country has been updated successfully.'
			: 'Country has been created successfully.',
	})
}
