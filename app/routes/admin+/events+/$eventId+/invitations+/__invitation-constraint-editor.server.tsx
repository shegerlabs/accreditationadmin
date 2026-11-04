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
import {
	InvitationConstraintDeleteSchema,
	InvitationConstraintEditorSchema,
} from './__invitation-constraint-editor'

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId, invitationId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: InvitationConstraintDeleteSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const constraintToDelete = await prisma.invitationConstraint.findUnique({
			where: { id: submission.value.id },
			select: {
				id: true,
				participantType: { select: { name: true } },
				invitation: { select: { name: true, tenantId: true } },
			},
		})

		await prisma.invitationConstraint.delete({
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.INVITATION_CONSTRAINT,
			entityId: submission.value.id,
			description: `Deleted constraint for "${constraintToDelete?.participantType.name}" from invitation "${constraintToDelete?.invitation.name}"`,
			userId: user.id,
			tenantId: constraintToDelete?.invitation.tenantId,
			metadata: { constraint: constraintToDelete },
		})

		return redirectWithToast(
			`/admin/events/${eventId}/invitations/${invitationId}/constraints`,
			{
				type: 'success',
				title: `Constraint Deleted`,
				description: `Constraint deleted successfully.`,
			},
		)
	}

	const submission = await parseWithZod(formData, {
		schema: InvitationConstraintEditorSchema.superRefine(async (data, ctx) => {
			const constraint = await prisma.invitationConstraint.findUnique({
				where: {
					invitationId_participantTypeId_accessLevel: {
						invitationId: data.invitationId,
						participantTypeId: data.participantTypeId,
						accessLevel: data.accessLevel,
					},
				},
				select: { id: true },
			})

			if (constraint && constraint.id !== data.id) {
				ctx.addIssue({
					path: ['participantTypeId'],
					code: z.ZodIssueCode.custom,
					message:
						'A constraint with this participant type and access level already exists.',
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

	const constraint = await prisma.invitationConstraint.upsert({
		select: {
			id: true,
			participantType: { select: { name: true } },
			invitation: { select: { name: true, tenantId: true } },
		},
		where: { id: constraintId ?? '__new_constraint__' },
		create: {
			invitationId: data.invitationId,
			participantTypeId: data.participantTypeId,
			accessLevel: data.accessLevel,
			quota: data.quota,
			sourceRestrictionId: data.sourceRestrictionId || null,
		},
		update: {
			participantTypeId: data.participantTypeId,
			accessLevel: data.accessLevel,
			quota: data.quota,
		},
	})

	await auditRequest({
		request,
		action: isUpdate ? AuditAction.UPDATE : AuditAction.CREATE,
		entityType: AuditEntityType.INVITATION_CONSTRAINT,
		entityId: constraint.id,
		description: `${isUpdate ? 'Updated' : 'Created'} constraint for "${constraint.participantType.name}" in invitation "${constraint.invitation.name}"`,
		userId: user.id,
		tenantId: constraint.invitation.tenantId,
		metadata: {
			constraint: { id: constraint.id, ...data },
		},
	})

	return redirectWithToast(
		`/admin/events/${eventId}/invitations/${invitationId}/constraints`,
		{
			type: 'success',
			title: `Constraint ${isUpdate ? 'Updated' : 'Created'}`,
			description: `Constraint ${isUpdate ? 'updated' : 'created'} successfully.`,
		},
	)
}
