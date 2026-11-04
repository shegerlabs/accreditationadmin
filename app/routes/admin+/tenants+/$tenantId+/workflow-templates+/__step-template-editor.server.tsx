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

const StepTemplateEditorSchema = z.object({
	id: z.string().optional(),
	workflowId: z.string(), // This is actually workflowTemplateId, but form sends as workflowId
	name: z.string().min(1, 'Name is required'),
	action: z.enum(['APPROVE', 'REJECT', 'NOTIFY', 'PRINT', 'ARCHIVE', 'CANCEL', 'BYPASS']),
	order: z.coerce.number().min(0),
	roleId: z.string().min(1, 'Role is required'),
	nextStepId: z.string().optional(),
	isRejectionTarget: z.preprocess(val => val === 'on' || val === true, z.boolean().default(false)),
	isBypassTarget: z.preprocess(val => val === 'on' || val === true, z.boolean().default(false)),
	requiresAssignment: z.preprocess(val => val === 'on' || val === true, z.boolean().default(true)),
	slaDurationMinutes: z.preprocess(
		val => (val === '' || val === undefined ? null : val),
		z.coerce.number().int().min(0).nullable().optional(),
	),
})

const StepTemplateDeleteSchema = z.object({
	id: z.string(),
})

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])

	const { tenantId, templateId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')
	const redirectUrl = formData.get('redirectUrl')?.toString() ||
		`/admin/tenants/${tenantId}/workflow-templates/${templateId}/steps/visual`

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: StepTemplateDeleteSchema,
			async: true,
		})
		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const stepToDelete = await prisma.stepTemplate.findUnique({
			where: { id: submission.value.id },
			select: {
				id: true,
				name: true,
				action: true,
				workflowTemplate: { select: { id: true, name: true, tenantId: true } },
			},
		})

		await prisma.stepTemplate.delete({
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.STEP_TEMPLATE,
			entityId: submission.value.id,
			description: `Deleted step template "${stepToDelete?.name}" from workflow template "${stepToDelete?.workflowTemplate.name}"`,
			userId: user.id,
			tenantId: stepToDelete?.workflowTemplate.tenantId || tenantId,
			metadata: { stepTemplate: stepToDelete },
		})

		return redirectWithToast(
			redirectUrl,
			{
				type: 'success',
				title: 'Step Deleted',
				description: 'Step template deleted successfully.',
			},
		)
	}

	const submission = await parseWithZod(formData, {
		schema: StepTemplateEditorSchema.superRefine(async (data, ctx) => {
			const step = await prisma.stepTemplate.findUnique({
				where: {
					workflowTemplateId_roleId_action_name: {
						workflowTemplateId: data.workflowId,
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

	const { id: stepId, workflowId, nextStepId, ...data } = submission.value

	// Convert '__none__' placeholder to null
	const resolvedNextStepId = nextStepId === '__none__' || !nextStepId
		? null
		: nextStepId

	// Check if isRejectionTarget or isBypassTarget is changing (must check BEFORE upsert)
	let wasRejectionTarget = false
	let wasBypassTarget = false
	if (stepId) {
		const existingStep = await prisma.stepTemplate.findUnique({
			where: { id: stepId },
			select: { isRejectionTarget: true, isBypassTarget: true },
		})
		wasRejectionTarget = existingStep?.isRejectionTarget ?? false
		wasBypassTarget = existingStep?.isBypassTarget ?? false
	}

	const willBeRejectionTarget = data.isRejectionTarget ?? false
	const willBeBypassTarget = data.isBypassTarget ?? false

	// Upsert the step template
	const upsertedStep = await prisma.stepTemplate.upsert({
		select: { id: true },
		where: { id: stepId ?? '__new_step__' },
		create: {
			...data,
			workflowTemplateId: workflowId,
			nextStepId: resolvedNextStepId,
		},
		update: {
			...data,
			nextStepId: resolvedNextStepId,
		},
	})

	// Handle rejection target changes
	if (!wasRejectionTarget && willBeRejectionTarget) {
		// Step is being flagged as rejection target
		// First, clear any existing rejection target and its REJECT steps
		const existingRejectionTarget = await prisma.stepTemplate.findFirst({
			where: {
				workflowTemplateId: workflowId,
				isRejectionTarget: true,
				id: { not: upsertedStep.id },
			},
			select: { id: true },
		})

		if (existingRejectionTarget) {
			// Unflag the old rejection target
			await prisma.stepTemplate.update({
				where: { id: existingRejectionTarget.id },
				data: { isRejectionTarget: false },
			})
			// Delete REJECT steps pointing to the old target
			await prisma.stepTemplate.deleteMany({
				where: {
					workflowTemplateId: workflowId,
					action: 'REJECT',
					nextStepId: existingRejectionTarget.id,
				},
			})
		}

		// Also delete any orphaned REJECT steps in this workflow template
		await prisma.stepTemplate.deleteMany({
			where: {
				workflowTemplateId: workflowId,
				action: 'REJECT',
			},
		})

		// Now create REJECT steps for the new target
		// Find event-scoped roles (validator, reviewer, focal)
		const roles = await prisma.role.findMany({
			where: {
				OR: [
					{ name: 'validator' },
					{ name: 'reviewer' },
					{ name: 'focal' },
				],
			},
			select: { id: true, name: true },
		})

		// Get max order for new steps
		const maxOrderStep = await prisma.stepTemplate.findFirst({
			where: { workflowTemplateId: workflowId },
			orderBy: { order: 'desc' },
			select: { order: true },
		})
		const baseOrder = (maxOrderStep?.order ?? 0) + 1

		// Create REJECT steps
		await prisma.stepTemplate.createMany({
			data: roles.map((role, index) => ({
				name: `Reject (${role.name})`,
				action: 'REJECT' as const,
				roleId: role.id,
				order: baseOrder + index,
				workflowTemplateId: workflowId,
				nextStepId: upsertedStep.id,
			})),
		})
	} else if (wasRejectionTarget && !willBeRejectionTarget) {
		// Step is being unflagged as rejection target - delete REJECT steps pointing to it
		await prisma.stepTemplate.deleteMany({
			where: {
				workflowTemplateId: workflowId,
				action: 'REJECT',
				nextStepId: upsertedStep.id,
			},
		})
	}

	// Handle bypass target changes
	if (!wasBypassTarget && willBeBypassTarget) {
		// Step is being flagged as bypass target
		// First, clear any existing bypass target and its BYPASS steps
		const existingBypassTarget = await prisma.stepTemplate.findFirst({
			where: {
				workflowTemplateId: workflowId,
				isBypassTarget: true,
				id: { not: upsertedStep.id },
			},
			select: { id: true },
		})

		if (existingBypassTarget) {
			// Unflag the old bypass target
			await prisma.stepTemplate.update({
				where: { id: existingBypassTarget.id },
				data: { isBypassTarget: false },
			})
			// Delete BYPASS steps pointing to the old target
			await prisma.stepTemplate.deleteMany({
				where: {
					workflowTemplateId: workflowId,
					action: 'BYPASS',
					nextStepId: existingBypassTarget.id,
				},
			})
		}

		// Also delete any orphaned BYPASS steps in this workflow template
		await prisma.stepTemplate.deleteMany({
			where: {
				workflowTemplateId: workflowId,
				action: 'BYPASS',
			},
		})

		// Now create BYPASS step for the new target (admin role only)
		const adminRole = await prisma.role.findFirst({
			where: { name: { equals: 'admin', mode: 'insensitive' } },
			select: { id: true },
		})

		if (adminRole) {
			// Get max order for new step
			const maxOrderStep = await prisma.stepTemplate.findFirst({
				where: { workflowTemplateId: workflowId },
				orderBy: { order: 'desc' },
				select: { order: true },
			})
			const newOrder = (maxOrderStep?.order ?? 0) + 1

			await prisma.stepTemplate.create({
				data: {
					name: 'Bypass',
					action: 'BYPASS',
					roleId: adminRole.id,
					order: newOrder,
					workflowTemplateId: workflowId,
					nextStepId: upsertedStep.id,
				},
			})
		}
	} else if (wasBypassTarget && !willBeBypassTarget) {
		// Step is being unflagged as bypass target - delete BYPASS steps pointing to it
		await prisma.stepTemplate.deleteMany({
			where: {
				workflowTemplateId: workflowId,
				action: 'BYPASS',
				nextStepId: upsertedStep.id,
			},
		})
	}

	// Get workflow template info for audit
	const workflowTemplate = await prisma.workflowTemplate.findUnique({
		where: { id: workflowId },
		select: { id: true, name: true, tenantId: true },
	})

	const isUpdate = !!stepId
	await auditRequest({
		request,
		action: isUpdate ? AuditAction.UPDATE : AuditAction.CREATE,
		entityType: AuditEntityType.STEP_TEMPLATE,
		entityId: upsertedStep.id,
		description: `${isUpdate ? 'Updated' : 'Created'} step template "${data.name}" in workflow template "${workflowTemplate?.name}"`,
		userId: user.id,
		tenantId: workflowTemplate?.tenantId || tenantId,
		metadata: {
			stepTemplate: { id: upsertedStep.id, ...data },
			workflowTemplate: workflowTemplate,
		},
	})

	return redirectWithToast(
		redirectUrl,
		{
			type: 'success',
			title: `Step ${isUpdate ? 'Updated' : 'Created'}`,
			description: `Step template ${isUpdate ? 'updated' : 'created'} successfully.`,
		},
	)
}
