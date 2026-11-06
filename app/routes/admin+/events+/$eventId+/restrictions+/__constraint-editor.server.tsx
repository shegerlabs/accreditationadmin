import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import {
	NOT_IN_EVENT_MESSAGE,
	isEventParticipantType,
} from '~/utils/event-participant-types.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import {
	ConstraintDeleteSchema,
	ConstraintEditorSchema,
} from './__constraint-editor'

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])

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

		const constraintToDelete = await prisma.constraint.findUnique({
			where: { id: submission.value.id },
			select: {
				id: true,
				tenantId: true,
				participantType: { select: { name: true } },
				restriction: { select: { name: true } },
			},
		})

		await prisma.constraint.delete({
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.RESTRICTION_CONSTRAINT,
			entityId: submission.value.id,
			description: `Deleted constraint for "${constraintToDelete?.participantType.name}" from restriction "${constraintToDelete?.restriction.name}"`,
			userId: user.id,
			tenantId: constraintToDelete?.tenantId,
			metadata: { constraint: constraintToDelete },
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
			if (
				!(await isEventParticipantType(eventId!, data.participantTypeId, {
					includeAny: true,
				}))
			) {
				ctx.addIssue({
					path: ['participantTypeId'],
					code: z.ZodIssueCode.custom,
					message: NOT_IN_EVENT_MESSAGE,
				})
				return
			}
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
	const isUpdate = !!constraintId

	const constraint = await prisma.constraint.upsert({
		select: {
			id: true,
			tenantId: true,
			participantType: { select: { name: true } },
			restriction: { select: { name: true } },
		},
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

	await auditRequest({
		request,
		action: isUpdate ? AuditAction.UPDATE : AuditAction.CREATE,
		entityType: AuditEntityType.RESTRICTION_CONSTRAINT,
		entityId: constraint.id,
		description: `${isUpdate ? 'Updated' : 'Created'} constraint for "${constraint.participantType.name}" in restriction "${constraint.restriction.name}"`,
		userId: user.id,
		tenantId: constraint.tenantId,
		metadata: {
			constraint: { id: constraint.id, ...data },
		},
	})

	return redirectWithToast(
		`/admin/events/${eventId}/restrictions/${restrictionId}/constraints`,
		{
			type: 'success',
			title: `Constraint ${isUpdate ? 'Updated' : 'Created'}`,
			description: `Constraint ${isUpdate ? 'updated' : 'created'} successfully.`,
		},
	)
}
