import { parseWithZod } from '@conform-to/zod'
import { createId as cuid } from '@paralleldrive/cuid2'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { registrationWizard } from '~/utils/registration.server'
import { deleteDirectory } from '~/utils/storage.server'
import { redirectWithToast } from '~/utils/toast.server'
import {
	attachmentHasFile,
	attachmentHasId,
	ParticipantDeleteSchema,
	ParticipantEditorSchema,
} from './__participant-editor'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin'])

	const { save, nextStep, prevStep } =
		await registrationWizard.register(request)
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: ParticipantDeleteSchema,
			async: true,
		})
		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}
		const participant = await prisma.participant.delete({
			where: { id: submission.value.id },
			select: { id: true },
		})

		await deleteDirectory({
			containerName: 'accreditation',
			directoryName: `participants/${participant.id}`,
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.PARTICIPANT,
			entityId: submission.value.id,
			description: 'Participant deleted',
			userId: user.id,
		})

		return redirectWithToast('/admin/participants', {
			type: 'success',
			title: `Participant Deleted`,
			description: `Participant deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: ParticipantEditorSchema.superRefine(async (data, ctx) => {
			const participant = await prisma.participant.findUnique({
				where: {
					tenantId_eventId_email: {
						eventId: data.eventId,
						tenantId: data.tenantId,
						email: data.email,
					},
				},
				select: { id: true },
			})

			if (participant && participant.id !== data.id) {
				ctx.addIssue({
					path: ['tenantId'],
					code: z.ZodIssueCode.custom,
					message:
						'Participant with this combination of tenant, event, participant type, and email already exists.',
				})
				return
			}
		}).transform(async ({ documents = [], ...data }) => {
			return {
				...data,
				updatedDocuments: await Promise.all(
					documents.filter(attachmentHasId).map(async i => {
						const attachment = await prisma.attachment.findUnique({
							where: { id: i.id },
						})

						if (attachmentHasFile(i)) {
							return {
								id: i.id,
								altText: i.altText,
								contentType: i.file.type,
								blob: Buffer.from(await i.file.arrayBuffer()),
								fileName: attachment?.fileName ?? cuid(),
								extension: i.file.name.split('.').pop() ?? '',
							}
						} else {
							return { id: i.id }
						}
					}),
				),
				newDocuments: await Promise.all(
					documents
						.filter(attachmentHasFile)
						.filter(image => !image.id)
						.map(async image => {
							const extension = image.file.name.split('.').pop() ?? ''
							return {
								altText: `${image.file.name}.${extension}`,
								contentType: image.file.type,
								blob: Buffer.from(await image.file.arrayBuffer()),
								fileName: cuid(),
								extension,
							}
						}),
				),
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

	const {
		id: participantId,
		updatedDocuments,
		newDocuments,
		...data
	} = submission.value

	return redirectWithToast('/admin/participants', {
		type: 'success',
		title: `Participant ${participantId ? 'Updated' : 'Created'}`,
		description: `Participant ${participantId ? 'updated' : 'created'} successfully.`,
	})
}
