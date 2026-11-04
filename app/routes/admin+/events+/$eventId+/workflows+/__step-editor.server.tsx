import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { auditRequest } from '~/utils/audit.server'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { StepDeleteSchema, StepEditorSchema } from './__step-editor'

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	const { eventId, workflowId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	// Get redirect URL from form data, fallback to list view
	const redirectUrl = formData.get('redirectUrl')?.toString() || `/admin/events/${eventId}/workflows/${workflowId}/steps`

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

		// Verify step belongs to current user's tenant
		const stepToDelete = await prisma.step.findFirst({
			where: {
				id: submission.value.id,
				workflow: { event: tenantFilter },
			},
			select: {
				id: true,
				name: true,
				action: true,
				tenantId: true,
				workflow: { select: { id: true, name: true } },
			},
		})

		invariantResponse(stepToDelete, 'Step not found', { status: 404 })

		await prisma.step.delete({
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.STEP,
			entityId: submission.value.id,
			description: `Deleted step "${stepToDelete?.name}" from workflow "${stepToDelete?.workflow.name}"`,
			userId: user.id,
			tenantId: stepToDelete?.tenantId,
			metadata: { step: stepToDelete },
		})

		return redirectWithToast(
			redirectUrl,
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
						name: data.name ?? '',
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

	const { id: stepId, name, nextStepId, ...data } = submission.value

	// Verify the workflow belongs to the current user's tenant
	const workflowForStep = await prisma.workflow.findFirst({
		where: {
			id: data.workflowId,
			event: tenantFilter,
		},
		select: { id: true },
	})

	invariantResponse(workflowForStep, 'Workflow not found', { status: 404 })

	// Convert '__none__' placeholder to null for database
	const resolvedNextStepId = nextStepId === '__none__' || !nextStepId ? null : nextStepId

	// Check if isRejectionTarget or isBypassTarget is changing (must check BEFORE upsert)
	let wasRejectionTarget = false
	let wasBypassTarget = false
	if (stepId) {
		// Verify existing step belongs to current user's tenant
		const existingStep = await prisma.step.findFirst({
			where: {
				id: stepId,
				workflow: { event: tenantFilter },
			},
			select: { isRejectionTarget: true, isBypassTarget: true },
		})
		invariantResponse(existingStep, 'Step not found', { status: 404 })
		wasRejectionTarget = existingStep?.isRejectionTarget ?? false
		wasBypassTarget = existingStep?.isBypassTarget ?? false
	}

	const willBeRejectionTarget = data.isRejectionTarget ?? false
	const willBeBypassTarget = data.isBypassTarget ?? false

	// Upsert the step
	const upsertedStep = await prisma.step.upsert({
		select: { id: true },
		where: { id: stepId ?? '__new_step__' },
		create: {
			...data,
			name: name!,
			nextStepId: resolvedNextStepId,
		},
		update: {
			...data,
			name: name!,
			nextStepId: resolvedNextStepId,
		},
	})

	// Handle rejection target changes
	if (!wasRejectionTarget && willBeRejectionTarget) {
		// Step is being flagged as rejection target
		// First, clear any existing rejection target and its REJECT steps
		const existingRejectionTarget = await prisma.step.findFirst({
			where: {
				workflowId,
				isRejectionTarget: true,
				id: { not: upsertedStep.id },
			},
			select: { id: true },
		})

		if (existingRejectionTarget) {
			// Unflag the old rejection target
			await prisma.step.update({
				where: { id: existingRejectionTarget.id },
				data: { isRejectionTarget: false },
			})
			// Delete REJECT steps pointing to the old target
			await prisma.step.deleteMany({
				where: {
					workflowId,
					action: 'REJECT',
					nextStepId: existingRejectionTarget.id,
				},
			})
		}

		// Also delete any orphaned REJECT steps in this workflow
		await prisma.step.deleteMany({
			where: {
				workflowId,
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
		const maxOrderStep = await prisma.step.findFirst({
			where: { workflowId },
			orderBy: { order: 'desc' },
			select: { order: true },
		})
		const baseOrder = (maxOrderStep?.order ?? 0) + 1

		// Create REJECT steps
		await prisma.step.createMany({
			data: roles.map((role, index) => ({
				name: `Reject (${role.name})`,
				action: 'REJECT' as const,
				roleId: role.id,
				order: baseOrder + index,
				tenantId: data.tenantId,
				workflowId: data.workflowId,
				nextStepId: upsertedStep.id,
			})),
		})
	} else if (wasRejectionTarget && !willBeRejectionTarget) {
		// Step is being unflagged as rejection target - delete REJECT steps pointing to it
		await prisma.step.deleteMany({
			where: {
				workflowId,
				action: 'REJECT',
				nextStepId: upsertedStep.id,
			},
		})
	}

	// Handle bypass target changes
	if (!wasBypassTarget && willBeBypassTarget) {
		// Step is being flagged as bypass target
		// First, clear any existing bypass target and its BYPASS steps
		const existingBypassTarget = await prisma.step.findFirst({
			where: {
				workflowId,
				isBypassTarget: true,
				id: { not: upsertedStep.id },
			},
			select: { id: true },
		})

		if (existingBypassTarget) {
			// Unflag the old bypass target
			await prisma.step.update({
				where: { id: existingBypassTarget.id },
				data: { isBypassTarget: false },
			})
			// Delete BYPASS steps pointing to the old target
			await prisma.step.deleteMany({
				where: {
					workflowId,
					action: 'BYPASS',
					nextStepId: existingBypassTarget.id,
				},
			})
		}

		// Also delete any orphaned BYPASS steps in this workflow
		await prisma.step.deleteMany({
			where: {
				workflowId,
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
			const maxOrderStep = await prisma.step.findFirst({
				where: { workflowId },
				orderBy: { order: 'desc' },
				select: { order: true },
			})
			const newOrder = (maxOrderStep?.order ?? 0) + 1

			await prisma.step.create({
				data: {
					name: 'Bypass',
					action: 'BYPASS',
					roleId: adminRole.id,
					order: newOrder,
					tenantId: data.tenantId,
					workflowId: data.workflowId,
					nextStepId: upsertedStep.id,
				},
			})
		}
	} else if (wasBypassTarget && !willBeBypassTarget) {
		// Step is being unflagged as bypass target - delete BYPASS steps pointing to it
		await prisma.step.deleteMany({
			where: {
				workflowId,
				action: 'BYPASS',
				nextStepId: upsertedStep.id,
			},
		})
	}

	// Get workflow info for audit
	const workflow = await prisma.workflow.findUnique({
		where: { id: workflowId },
		select: { id: true, name: true },
	})

	const isUpdate = !!stepId
	await auditRequest({
		request,
		action: isUpdate ? AuditAction.UPDATE : AuditAction.CREATE,
		entityType: AuditEntityType.STEP,
		entityId: upsertedStep.id,
		description: `${isUpdate ? 'Updated' : 'Created'} step "${name}" in workflow "${workflow?.name}"`,
		userId: user.id,
		tenantId: data.tenantId,
		metadata: {
			step: { id: upsertedStep.id, name, ...data },
			workflow: workflow,
		},
	})

	return redirectWithToast(
		redirectUrl,
		{
			type: 'success',
			title: `Step ${isUpdate ? 'Updated' : 'Created'}`,
			description: `Step ${isUpdate ? 'updated' : 'created'} successfully.`,
		},
	)
}
