import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import {
	ConstraintDeleteSchema,
	ConstraintEditorSchema,
} from './__constraint-editor'

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId, restrictionId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: ConstraintDeleteSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		await prisma.constraint.delete({
			where: { id: submission.value.id },
		})

		return redirectWithToast(
			`/admin/events/${eventId}/restrictions/${restrictionId}/constraints`,
			{
				type: 'success',
				title: `Constraint Deleted`,
				description: `Constraint deleted successfully.`,
			},
		)
	}

	const submission = await parseWithZod(formData, {
		schema: ConstraintEditorSchema.superRefine(async (data, ctx) => {
			const constraint = await prisma.constraint.findUnique({
				where: {
					tenantId_restrictionId_participantTypeId_accessLevel: {
						tenantId: data.tenantId,
						restrictionId: data.restrictionId,
						participantTypeId: data.participantTypeId,
						accessLevel: data.accessLevel,
					},
				},
				select: { id: true },
			})

			if (constraint && constraint.id !== data.id) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message: 'Constraint with this name already exists.',
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

	const { id: constraintId, ...data } = submission.value

	await prisma.constraint.upsert({
		select: { id: true },
		where: { id: constraintId ?? '__new_constraint__' },
		create: {
			...data,
			quota: Number(data.quota ?? 0),
		},
		update: {
			...data,
			quota: Number(data.quota ?? 0),
		},
	})

	return redirectWithToast(
		`/admin/events/${eventId}/restrictions/${restrictionId}/constraints`,
		{
			type: 'success',
			title: `Constraint ${constraintId ? 'Updated' : 'Created'}`,
			description: `Constraint ${constraintId ? 'updated' : 'created'} successfully.`,
		},
	)
}
