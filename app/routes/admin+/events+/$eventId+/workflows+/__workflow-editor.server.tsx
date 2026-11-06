import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { auditRequest } from '~/utils/audit.server'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import {
	addEventParticipantType,
	getWorkflowParticipantTypes,
} from '~/utils/event-participant-types.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { cloneStepsFromTemplate } from '~/utils/workflow-clone.server'
import { WorkflowDeleteSchema, WorkflowEditorSchema } from './__workflow-editor'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)
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

		// Verify workflow belongs to the current user's tenant before deletion
		const workflowToDelete = await prisma.workflow.findFirst({
			where: {
				id: submission.value.id,
				event: tenantFilter,
			},
			select: {
				id: true,
				name: true,
				eventId: true,
				tenantId: true,
				participantType: { select: { id: true, name: true } },
				event: { select: { id: true, name: true } },
				_count: { select: { steps: true } },
			},
		})

		invariantResponse(workflowToDelete, 'Workflow not found', { status: 404 })

		const workflow = await prisma.workflow.delete({
			select: { eventId: true },
			where: { id: submission.value.id },
		})

		// Log workflow deletion
		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.WORKFLOW,
			entityId: submission.value.id,
			description: `Deleted workflow "${workflowToDelete.name}" from event "${workflowToDelete.event.name}"`,
			userId: user.id,
			tenantId: workflowToDelete.tenantId,
			metadata: {
				workflow: {
					id: workflowToDelete.id,
					name: workflowToDelete.name,
					participantType: workflowToDelete.participantType.name,
					stepsCount: workflowToDelete._count.steps,
				},
				event: {
					id: workflowToDelete.event.id,
					name: workflowToDelete.event.name,
				},
			},
		})

		return redirectWithToast(`/admin/events/${workflow.eventId}/workflows`, {
			type: 'success',
			title: `Workflow Deleted`,
			description: `Workflow deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: WorkflowEditorSchema.superRefine(async (data, ctx) => {
			const allowed = await getWorkflowParticipantTypes(data.eventId)
			if (!allowed.some(t => t.id === data.participantTypeId)) {
				ctx.addIssue({
					path: ['participantTypeId'],
					code: z.ZodIssueCode.custom,
					message: 'Workflows can only be created for real participant types.',
				})
				return
			}
			const workflow = await prisma.workflow.findUnique({
				where: {
					tenantId_eventId_participantTypeId_name: {
						eventId: data.eventId,
						tenantId: data.tenantId,
						participantTypeId: data.participantTypeId,
						name: data.name ?? '',
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

	const { id: workflowId, name, templateId, ...data } = submission.value

	// Verify the event belongs to the current user's tenant
	const eventForWorkflow = await prisma.event.findFirst({
		where: {
			id: data.eventId,
			...tenantFilter,
		},
		select: { id: true },
	})

	invariantResponse(eventForWorkflow, 'Event not found', { status: 404 })

	// If editing, verify the workflow belongs to the current user's tenant
	if (workflowId) {
		const existingWorkflow = await prisma.workflow.findFirst({
			where: {
				id: workflowId,
				event: tenantFilter,
			},
			select: { id: true },
		})
		invariantResponse(existingWorkflow, 'Workflow not found', { status: 404 })
	}

	const workflow = await prisma.workflow.upsert({
		select: { id: true },
		where: { id: workflowId ?? '__new_workflow__' },
		create: {
			...data,
			name: name!,
		},
		update: {
			...data,
			name: name!,
		},
	})

	// A workflow means the event uses this type, so badge and quota forms and
	// the portal offer it from now on.
	await addEventParticipantType(prisma, data.eventId, data.participantTypeId)

	// Clone steps from template if templateId is provided and this is a new workflow
	const resolvedTemplateId = templateId === '__none__' ? undefined : templateId
	if (!workflowId && resolvedTemplateId) {
		await cloneStepsFromTemplate(prisma, {
			workflowTemplateId: resolvedTemplateId,
			workflowId: workflow.id,
			tenantId: data.tenantId,
		})
	}

	// Get event and participant type details for audit log
	const event = await prisma.event.findUnique({
		where: { id: data.eventId },
		select: { id: true, name: true },
	})
	const participantType = await prisma.participantType.findUnique({
		where: { id: data.participantTypeId },
		select: { id: true, name: true },
	})

	// Log workflow creation/update
	await auditRequest({
		request,
		action: workflowId ? AuditAction.UPDATE : AuditAction.CREATE,
		entityType: AuditEntityType.WORKFLOW,
		entityId: workflow.id,
		description: workflowId
			? `Updated workflow "${name}" for event "${event?.name}"`
			: `Created workflow "${name}" for event "${event?.name}" from template`,
		userId: user.id,
		tenantId: data.tenantId,
		metadata: {
			workflow: {
				id: workflow.id,
				name,
				participantType: participantType?.name,
			},
			event: {
				id: event?.id,
				name: event?.name,
			},
			...(resolvedTemplateId && !workflowId
				? { templateId: resolvedTemplateId, clonedFromTemplate: true }
				: {}),
			isUpdate: !!workflowId,
		},
	})

	return redirectWithToast(`/admin/events/${data.eventId}/workflows`, {
		type: 'success',
		title: `Workflow ${workflowId ? 'Updated' : 'Created'}`,
		description: `Workflow ${workflowId ? 'updated' : 'created'} successfully.`,
	})
}
