import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { auditRequest } from '~/utils/audit.server'
import { requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { AccessEditorSchema, AccessDeleteSchema, AccessEditSchema } from './__access-editor'

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const { eventId } = params
	invariantResponse(eventId, 'Event ID is required')

	// Non-global admins must have a tenant
	if (!user.isGlobalAdmin && !user.tenantId) {
		throw json({ error: 'Access denied' }, { status: 403 })
	}

	// Verify event access
	const event = await prisma.event.findFirst({
		where: {
			id: eventId,
			...(user.isGlobalAdmin ? {} : { tenantId: user.tenantId! }),
		},
		select: { id: true, name: true },
	})

	invariantResponse(event, 'Access denied', { status: 403 })

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: AccessDeleteSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json({ result: submission.reply() }, { status: 400 })
		}

		const { id: accessId, allIds: allIdsString } = submission.value
		invariantResponse(accessId, 'Access ID is required')

		// Parse all IDs from comma-separated string
		const allIds = allIdsString ? allIdsString.split(',').filter(Boolean) : [accessId]

		// Verify the first access record exists and belongs to this event (for audit info)
		const accessRecord = await prisma.userEventAccess.findFirst({
			where: {
				id: accessId,
				eventId: eventId,
			},
			include: {
				user: { select: { username: true } },
				role: { select: { name: true } },
			},
		})

		invariantResponse(accessRecord, 'Access record not found', { status: 404 })

		// Delete all access records
		const deleteResult = await prisma.userEventAccess.deleteMany({
			where: {
				id: { in: allIds },
				eventId: eventId,
			},
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.USER,
			entityId: accessId,
			description: `Revoked ${accessRecord.role.name} access for ${accessRecord.user.username} on event ${event.name} (${deleteResult.count} record(s))`,
			userId: user.id,
		})

		return redirectWithToast(`/admin/events/${eventId}/access`, {
			type: 'success',
			title: 'Access Revoked',
			description: `Successfully revoked ${deleteResult.count} access record(s) for ${accessRecord.user.username}`,
		})
	}

	if (intent === 'edit') {
		const submission = await parseWithZod(formData, {
			schema: AccessEditSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json({ result: submission.reply() }, { status: 400 })
		}

		const { id: accessId, allIds: allIdsString, userId, roleId, participantTypeSelection, participantTypeIds, stepName } =
			submission.value

		// Parse all IDs from comma-separated string
		const allIds = allIdsString ? allIdsString.split(',').filter(Boolean) : [accessId]

		// Verify the user exists
		const targetUser = await prisma.user.findFirst({
			where: {
				id: userId,
				...(user.isGlobalAdmin ? {} : { tenantId: user.tenantId! }),
			},
			select: { id: true, username: true },
		})

		invariantResponse(targetUser, 'User not found or access denied', { status: 403 })

		// Verify the role exists
		const role = await prisma.role.findUnique({
			where: { id: roleId },
			select: { id: true, name: true },
		})

		invariantResponse(role, 'Role not found', { status: 404 })

		// Get all workflows for this event
		const workflows = await prisma.workflow.findMany({
			where: { eventId },
			select: {
				id: true,
				participantType: {
					select: { id: true, name: true },
				},
				steps: {
					select: { id: true, name: true },
				},
			},
		})

		// Determine which participant types to process
		let targetParticipantTypeIds: string[]
		if (participantTypeSelection === 'all') {
			targetParticipantTypeIds = workflows.map(w => w.participantType.id)
		} else {
			targetParticipantTypeIds = participantTypeIds ?? []
		}

		if (targetParticipantTypeIds.length === 0) {
			return json(
				{
					result: submission.reply({
						formErrors: ['Please select at least one participant type'],
					}),
				},
				{ status: 400 },
			)
		}

		// Find steps with matching name in each selected workflow
		const stepsToGrant: { stepId: string; participantTypeName: string }[] = []

		for (const ptId of targetParticipantTypeIds) {
			const workflow = workflows.find(w => w.participantType.id === ptId)
			if (!workflow) continue

			const step = workflow.steps.find(s => s.name === stepName)
			if (!step) continue

			stepsToGrant.push({
				stepId: step.id,
				participantTypeName: workflow.participantType.name,
			})
		}

		if (stepsToGrant.length === 0) {
			return json(
				{
					result: submission.reply({
						formErrors: [
							`No matching step "${stepName}" found in the selected participant types`,
						],
					}),
				},
				{ status: 400 },
			)
		}

		// Delete old access records
		await prisma.userEventAccess.deleteMany({
			where: {
				id: { in: allIds },
				eventId: eventId,
			},
		})

		// Create new access records
		let createdCount = 0

		for (const { stepId } of stepsToGrant) {
			// Check for existing access record (in case user has other access for same step)
			const existingAccess = await prisma.userEventAccess.findFirst({
				where: {
					userId,
					eventId,
					roleId,
					stepId,
				},
			})

			if (existingAccess) {
				continue
			}

			await prisma.userEventAccess.create({
				data: {
					userId,
					eventId,
					roleId,
					stepId,
				},
			})

			createdCount++
		}

		await auditRequest({
			request,
			action: AuditAction.UPDATE,
			entityType: AuditEntityType.USER,
			entityId: accessId,
			description: `Updated access for ${targetUser.username}: ${role.name} role, step "${stepName}" on event ${event.name} (${createdCount} record(s))`,
			userId: user.id,
		})

		return redirectWithToast(`/admin/events/${eventId}/access`, {
			type: 'success',
			title: 'Access Updated',
			description: `Successfully updated access for ${targetUser.username} with ${createdCount} record(s)`,
		})
	}

	// Create intent
	const submission = await parseWithZod(formData, {
		schema: AccessEditorSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json({ result: submission.reply() }, { status: 400 })
	}

	const { userId, roleId, participantTypeSelection, participantTypeIds, stepName } =
		submission.value

	// Verify the user exists and belongs to the same tenant (if not global admin)
	const targetUser = await prisma.user.findFirst({
		where: {
			id: userId,
			...(user.isGlobalAdmin ? {} : { tenantId: user.tenantId! }),
		},
		select: { id: true, username: true },
	})

	invariantResponse(targetUser, 'User not found or access denied', { status: 403 })

	// Verify the role exists
	const role = await prisma.role.findUnique({
		where: { id: roleId },
		select: { id: true, name: true },
	})

	invariantResponse(role, 'Role not found', { status: 404 })

	// Get all workflows for this event with their steps and participant types
	const workflows = await prisma.workflow.findMany({
		where: { eventId },
		select: {
			id: true,
			participantType: {
				select: { id: true, name: true },
			},
			steps: {
				select: { id: true, name: true },
			},
		},
	})

	// Determine which participant types to process
	let targetParticipantTypeIds: string[]
	if (participantTypeSelection === 'all') {
		targetParticipantTypeIds = workflows.map(w => w.participantType.id)
	} else {
		targetParticipantTypeIds = participantTypeIds ?? []
	}

	if (targetParticipantTypeIds.length === 0) {
		return json(
			{
				result: submission.reply({
					formErrors: ['Please select at least one participant type'],
				}),
			},
			{ status: 400 },
		)
	}

	// Find steps with matching name in each selected workflow
	const stepsToGrant: { stepId: string; participantTypeName: string }[] = []

	for (const ptId of targetParticipantTypeIds) {
		const workflow = workflows.find(w => w.participantType.id === ptId)
		if (!workflow) continue // Skip if no workflow for this participant type

		const step = workflow.steps.find(s => s.name === stepName)
		if (!step) continue // Skip if step name doesn't exist in this workflow

		stepsToGrant.push({
			stepId: step.id,
			participantTypeName: workflow.participantType.name,
		})
	}

	if (stepsToGrant.length === 0) {
		return json(
			{
				result: submission.reply({
					formErrors: [
						`No matching step "${stepName}" found in the selected participant types`,
					],
				}),
			},
			{ status: 400 },
		)
	}

	// Create access records, skipping existing ones
	let createdCount = 0
	let skippedCount = 0

	for (const { stepId } of stepsToGrant) {
		// Check for existing access record
		const existingAccess = await prisma.userEventAccess.findFirst({
			where: {
				userId,
				eventId,
				roleId,
				stepId,
			},
		})

		if (existingAccess) {
			skippedCount++
			continue
		}

		// Create the access record
		const newAccess = await prisma.userEventAccess.create({
			data: {
				userId,
				eventId,
				roleId,
				stepId,
			},
		})

		await auditRequest({
			request,
			action: AuditAction.CREATE,
			entityType: AuditEntityType.USER,
			entityId: newAccess.id,
			description: `Granted ${role.name} access to ${targetUser.username} for step "${stepName}" on event ${event.name}`,
			userId: user.id,
		})

		createdCount++
	}

	// Build success message
	let description: string
	if (createdCount === 0 && skippedCount > 0) {
		return json(
			{
				result: submission.reply({
					formErrors: [
						`User already has access to all ${skippedCount} selected participant type(s) for this step`,
					],
				}),
			},
			{ status: 400 },
		)
	} else if (skippedCount > 0) {
		description = `Granted ${role.name} access to ${targetUser.username} for ${createdCount} participant type(s). ${skippedCount} already existed and were skipped.`
	} else {
		description = `Granted ${role.name} access to ${targetUser.username} for ${createdCount} participant type(s)`
	}

	return redirectWithToast(`/admin/events/${eventId}/access`, {
		type: 'success',
		title: 'Access Granted',
		description,
	})
}
