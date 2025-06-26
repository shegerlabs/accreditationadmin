import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
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
	await requireUserWithRoles(request, ['admin'])

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

		await prisma.participantType.delete({
			where: { id: submission.value.id },
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

	const { id: participantTypeId, ...data } = submission.value

	await prisma.participantType.upsert({
		select: { id: true },
		where: { id: participantTypeId ?? '__new_participant_type__' },
		create: {
			...data,
			canSendPrivateRequest: data.canSendPrivateRequest ?? false,
			canSendAnonymousRequest: data.canSendAnonymousRequest ?? false,
			isExemptedFromFullQuota: data.isExemptedFromFullQuota ?? false,
			isExemptedFromOpenSessionQuota:
				data.isExemptedFromOpenSessionQuota ?? false,
			isExemptedFromClosedSessionQuota:
				data.isExemptedFromClosedSessionQuota ?? false,
		},
		update: {
			...data,
			canSendPrivateRequest: data.canSendPrivateRequest ?? false,
			canSendAnonymousRequest: data.canSendAnonymousRequest ?? false,
			isExemptedFromFullQuota: data.isExemptedFromFullQuota ?? false,
			isExemptedFromOpenSessionQuota:
				data.isExemptedFromOpenSessionQuota ?? false,
			isExemptedFromClosedSessionQuota:
				data.isExemptedFromClosedSessionQuota ?? false,
		},
	})

	return redirectWithToast(`/admin/tenants/${tenantId}/participant-types`, {
		type: 'success',
		title: `Participant Type ${participantTypeId ? 'Updated' : 'Created'}`,
		description: `Participant Type ${participantTypeId ? 'updated' : 'created'} successfully.`,
	})
}
