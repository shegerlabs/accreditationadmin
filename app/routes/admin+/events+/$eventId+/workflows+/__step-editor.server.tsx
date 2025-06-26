import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import { StepDeleteSchema, StepEditorSchema } from './__step-editor'

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId, workflowId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: StepDeleteSchema,
			async: true,
		})
		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		await prisma.step.delete({
			where: { id: submission.value.id },
		})

		return redirectWithToast(
			`/admin/events/${eventId}/workflows/${workflowId}/steps`,
			{
				type: 'success',
				title: `Step Deleted`,
				description: `Step deleted successfully.`,
			},
		)
	}

	const submission = await parseWithZod(formData, {
		schema: StepEditorSchema.superRefine(async (data, ctx) => {
			const step = await prisma.step.findUnique({
				where: {
					tenantId_workflowId_roleId_action_name: {
						tenantId: data.tenantId,
						workflowId: data.workflowId,
						roleId: data.roleId,
						action: data.action,
						name: data.name,
					},
				},
				select: { id: true },
			})

			if (step && step.id !== data.id) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message: 'Step with this name already exists.',
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

	const { id: stepId, ...data } = submission.value

	await prisma.step.upsert({
		select: { id: true },
		where: { id: stepId ?? '__new_step__' },
		create: {
			...data,
			order: 0,
		},
		update: {
			...data,
		},
	})

	return redirectWithToast(
		`/admin/events/${eventId}/workflows/${workflowId}/steps`,
		{
			type: 'success',
			title: `Step ${stepId ? 'Updated' : 'Created'}`,
			description: `Step ${stepId ? 'updated' : 'created'} successfully.`,
		},
	)
}
