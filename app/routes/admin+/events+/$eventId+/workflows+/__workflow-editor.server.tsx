import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import { WorkflowDeleteSchema, WorkflowEditorSchema } from './__workflow-editor'

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: WorkflowDeleteSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const workflow = await prisma.workflow.delete({
			select: { eventId: true },
			where: { id: submission.value.id },
		})

		return redirectWithToast(`/admin/events/${workflow.eventId}/workflows`, {
			type: 'success',
			title: `Workflow Deleted`,
			description: `Workflow deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: WorkflowEditorSchema.superRefine(async (data, ctx) => {
			const workflow = await prisma.workflow.findUnique({
				where: {
					tenantId_eventId_participantTypeId_name: {
						eventId: data.eventId,
						tenantId: data.tenantId,
						participantTypeId: data.participantTypeId,
						name: data.name,
					},
				},
				select: { id: true },
			})

			if (workflow && workflow.id !== data.id) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message:
						'Workflow with this name already exists for this participant type.',
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

	const { id: workflowId, ...data } = submission.value

	await prisma.workflow.upsert({
		where: { id: workflowId ?? '__new_workflow__' },
		create: {
			...data,
		},
		update: {
			...data,
		},
	})

	return redirectWithToast(`/admin/events/${data.eventId}/workflows`, {
		type: 'success',
		title: `Workflow ${workflowId ? 'Updated' : 'Created'}`,
		description: `Workflow ${workflowId ? 'updated' : 'created'} successfully.`,
	})
}
