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
	ParticipantTypeDeleteSchema,
	ParticipantTypeEditorSchema,
} from './__participant-type-editor'

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])

	const { tenantId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: ParticipantTypeDeleteSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const participantTypeToDelete = await prisma.participantType.findUnique({
			where: { id: submission.value.id },
			select: { id: true, name: true, description: true, tenantId: true },
		})

		await prisma.participantType.delete({
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.PARTICIPANT_TYPE,
			entityId: submission.value.id,
			description: `Deleted participant type "${participantTypeToDelete?.name}"`,
			userId: user.id,
			tenantId: participantTypeToDelete?.tenantId || tenantId,
			metadata: {
				participantType: participantTypeToDelete,
			},
		})

		return redirectWithToast(`/admin/tenants/${tenantId}/participant-types`, {
			type: 'success',
			title: `Participant Type Deleted`,
			description: `Participant Type deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: ParticipantTypeEditorSchema.superRefine(async (data, ctx) => {
			const participantType = await prisma.participantType.findFirst({
				where: { name: data.name },
				select: { id: true },
			})

			if (participantType && participantType.id !== data.id) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message: 'Participant type with this name already exists.',
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

	const { id: participantTypeId, name, description, ...data } = submission.value

	const isUpdate = !!participantTypeId

	const participantType = await prisma.participantType.upsert({
		select: { id: true, name: true, tenantId: true },
		where: { id: participantTypeId ?? '__new_participant_type__' },
		create: {
			...data,
			name: name!,
			description: description!,
			isExemptedFromFullQuota: data.isExemptedFromFullQuota ?? false,
			isExemptedFromOpenSessionQuota:
				data.isExemptedFromOpenSessionQuota ?? false,
			isExemptedFromClosedSessionQuota:
				data.isExemptedFromClosedSessionQuota ?? false,
		},
		update: {
			...data,
			name: name!,
			description: description!,
			isExemptedFromFullQuota: data.isExemptedFromFullQuota ?? false,
			isExemptedFromOpenSessionQuota:
				data.isExemptedFromOpenSessionQuota ?? false,
			isExemptedFromClosedSessionQuota:
				data.isExemptedFromClosedSessionQuota ?? false,
		},
	})

	await auditRequest({
		request,
		action: isUpdate ? AuditAction.UPDATE : AuditAction.CREATE,
		entityType: AuditEntityType.PARTICIPANT_TYPE,
		entityId: participantType.id,
		description: `${isUpdate ? 'Updated' : 'Created'} participant type "${name}"`,
		userId: user.id,
		tenantId: participantType.tenantId || tenantId,
		metadata: {
			participantType: {
				id: participantType.id,
				name,
				description,
				...data,
			},
		},
	})

	return redirectWithToast(`/admin/tenants/${tenantId}/participant-types`, {
		type: 'success',
		title: `Participant Type ${isUpdate ? 'Updated' : 'Created'}`,
		description: `Participant Type ${isUpdate ? 'updated' : 'created'} successfully.`,
	})
}
