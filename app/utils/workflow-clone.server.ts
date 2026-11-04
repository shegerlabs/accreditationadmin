// Cloning a WorkflowTemplate into a concrete Workflow.
//
// Three call sites need this and each used to carry its own copy: the workflow
// editor, the bulk-create action, and scripts/setup-event.ts. Adding a field to
// Step meant remembering all three, so it lives here instead.
//
// Takes the Prisma client as an argument rather than importing it, so callers
// can pass a transaction client and have the clone roll back with everything
// else. Keep this module free of Remix imports: the CLI scripts import it too.

import { type Prisma } from '@prisma/client'

type Db = Prisma.TransactionClient

/**
 * ParticipantType names that never get a workflow of their own. "Any" is the
 * catch-all used by restriction constraints, not a real category of attendee.
 */
export const NON_WORKFLOW_PARTICIPANT_TYPES = ['Any']

/** The naming convention for a workflow cloned from a template. */
export function workflowNameFromTemplate(
	participantTypeName: string,
	templateName: string,
) {
	return `${participantTypeName} - ${templateName}`
}

/**
 * Copy a template's steps onto an existing workflow.
 *
 * Two passes: `nextStepId` points at rows that do not exist yet during the
 * first, so the links are applied only once every step has a real id.
 *
 * Returns the number of steps created.
 */
export async function cloneStepsFromTemplate(
	db: Db,
	{
		workflowTemplateId,
		workflowId,
		tenantId,
	}: { workflowTemplateId: string; workflowId: string; tenantId: string },
) {
	const stepTemplates = await db.stepTemplate.findMany({
		where: { workflowTemplateId },
		orderBy: { order: 'asc' },
	})
	if (stepTemplates.length === 0) return 0

	const stepIdMap = new Map<string, string>()

	for (const template of stepTemplates) {
		const step = await db.step.create({
			data: {
				name: template.name,
				action: template.action,
				order: template.order,
				roleId: template.roleId,
				tenantId,
				workflowId,
				isRejectionTarget: template.isRejectionTarget,
				isBypassTarget: template.isBypassTarget,
				requiresAssignment: template.requiresAssignment,
				slaDurationMinutes: template.slaDurationMinutes,
				// nextStepId is set in the second pass.
			},
		})
		stepIdMap.set(template.id, step.id)
	}

	for (const template of stepTemplates) {
		if (!template.nextStepId) continue
		const from = stepIdMap.get(template.id)
		const to = stepIdMap.get(template.nextStepId)
		if (from && to) {
			await db.step.update({ where: { id: from }, data: { nextStepId: to } })
		}
	}

	return stepTemplates.length
}

/**
 * Create a workflow for one participant type and clone a template's steps onto
 * it. Returns the new workflow's id and how many steps it received.
 */
export async function createWorkflowFromTemplate(
	db: Db,
	{
		tenantId,
		eventId,
		participantTypeId,
		participantTypeName,
		templateId,
		templateName,
	}: {
		tenantId: string
		eventId: string
		participantTypeId: string
		participantTypeName: string
		templateId: string
		templateName: string
	},
) {
	const workflow = await db.workflow.create({
		data: {
			name: workflowNameFromTemplate(participantTypeName, templateName),
			tenantId,
			eventId,
			participantTypeId,
		},
	})

	const stepCount = await cloneStepsFromTemplate(db, {
		workflowTemplateId: templateId,
		workflowId: workflow.id,
		tenantId,
	})

	return { workflowId: workflow.id, stepCount }
}
