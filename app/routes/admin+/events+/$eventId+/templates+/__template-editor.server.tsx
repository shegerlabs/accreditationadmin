import { parseWithZod } from '@conform-to/zod'
import { createId as cuid } from '@paralleldrive/cuid2'
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
import {
	deleteDirectory,
	deleteFileIfExists,
	uploadFile,
} from '~/utils/storage.server'
import { redirectWithToast } from '~/utils/toast.server'
import {
	attachmentHasFile,
	attachmentHasId,
	TemplateDeleteSchema,
	TemplateEditorSchema,
} from './__template-editor'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: TemplateDeleteSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const templateToDelete = await prisma.template.findUnique({
			where: { id: submission.value.id },
			select: { id: true, name: true, eventId: true, tenantId: true, event: { select: { name: true } } },
		})

		const template = await prisma.template.delete({
			where: { id: submission.value.id },
			select: { id: true, eventId: true },
		})

		await deleteDirectory({
			containerName: 'accreditation',
			directoryName: `templates/${template.id}`,
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.TEMPLATE,
			entityId: submission.value.id,
			description: `Deleted template "${templateToDelete?.name}" from event "${templateToDelete?.event.name}"`,
			userId: user.id,
			tenantId: templateToDelete?.tenantId,
			metadata: { template: templateToDelete },
		})

		return redirectWithToast(`/admin/events/${template.eventId}/templates`, {
			type: 'success',
			title: `Template Deleted`,
			description: `Template deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: TemplateEditorSchema.superRefine(async (data, ctx) => {
			if (
				!(await isEventParticipantType(data.eventId, data.participantTypeId))
			) {
				ctx.addIssue({
					path: ['participantTypeId'],
					code: z.ZodIssueCode.custom,
					message: NOT_IN_EVENT_MESSAGE,
				})
				return
			}
			const participantType = await prisma.participantType.findUniqueOrThrow({
				where: { id: data.participantTypeId },
			})

			const name = `Badge Template for ${participantType.name}`

			const template = await prisma.template.findUnique({
				where: {
					tenantId_eventId_templateType_name: {
						eventId: data.eventId,
						tenantId: data.tenantId,
						templateType: data.templateType,
						name,
					},
				},
				select: { id: true },
			})

			if (template && template.id !== data.id) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message: 'Template with this name already exists.',
				})
				return
			}
		}).transform(async ({ attachments = [], ...data }) => {
			return {
				...data,
				updatedAttachments: await Promise.all(
					attachments.filter(attachmentHasId).map(async i => {
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
				newAttachments: await Promise.all(
					attachments
						.filter(attachmentHasFile)
						.filter(image => !image.id)
						.map(async image => {
							const extension = image.file.name.split('.').pop() ?? ''
							return {
								altText: `${image.altText ?? ''}`,
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

	const participantType = await prisma.participantType.findUniqueOrThrow({
		where: { id: submission.value.participantTypeId },
	})

	const {
		id: templateId,
		updatedAttachments,
		newAttachments,
		badgeTemplateId,
		...data
	} = submission.value

	const deletedAttachments = await prisma.attachment.findMany({
		select: { fileName: true, extension: true },
		where: { id: { notIn: updatedAttachments.map(i => i.id) } },
	})

	const name = `Badge Template for ${participantType.name}`
	const description = `Badge Template for ${participantType.name}`

	const template = await prisma.template.upsert({
		select: { id: true },
		where: { id: templateId ?? '__new_template__' },
		create: {
			...data,
			name,
			description,
			badgeTemplateId: badgeTemplateId ?? null,
			attachments: {
				create: newAttachments.map(({ blob, ...attachment }) => attachment),
			},
		},
		update: {
			...data,
			name,
			description,
			badgeTemplateId: badgeTemplateId ?? null,
			attachments: {
				deleteMany: { id: { notIn: updatedAttachments.map(i => i.id) } },
				updateMany: updatedAttachments.map(({ blob, ...updates }) => ({
					where: { id: updates.id },
					data: { ...updates, id: blob ? cuid() : updates.id },
				})),
				create: newAttachments.map(({ blob, ...attachment }) => attachment),
			},
		},
	})

	const deletePromises = deletedAttachments.map(attachment =>
		deleteFileIfExists({
			containerName: 'accreditation',
			prefix: `templates/${template.id}`,
			fileName: attachment.fileName,
		}),
	)

	const updatePromises = updatedAttachments.map(attachment => {
		if (attachment.blob) {
			return uploadFile({
				containerName: 'accreditation',
				directory: `templates/${template.id}`,
				fileName: attachment.fileName,
				extension: attachment.extension,
				blob: attachment.blob,
			})
		}
		return Promise.resolve()
	})

	const newAttachmentsPromises = newAttachments.map(attachment =>
		uploadFile({
			containerName: 'accreditation',
			directory: `templates/${template.id}`,
			fileName: attachment.fileName,
			extension: attachment.extension,
			blob: attachment.blob,
		}),
	)

	await Promise.all([
		...deletePromises,
		...updatePromises,
		...newAttachmentsPromises,
	])

	const isUpdate = !!templateId
	const event = await prisma.event.findUnique({
		where: { id: data.eventId },
		select: { name: true },
	})

	await auditRequest({
		request,
		action: isUpdate ? AuditAction.UPDATE : AuditAction.CREATE,
		entityType: AuditEntityType.TEMPLATE,
		entityId: template.id,
		description: `${isUpdate ? 'Updated' : 'Created'} template "${name}" for event "${event?.name}"`,
		userId: user.id,
		tenantId: data.tenantId,
		metadata: {
			template: { id: template.id, name, ...data },
			participantType: participantType.name,
		},
	})

	return redirectWithToast(`/admin/events/${data.eventId}/templates`, {
		type: 'success',
		title: `Template ${isUpdate ? 'Updated' : 'Created'}`,
		description: `Template ${isUpdate ? 'updated' : 'created'} successfully.`,
	})
}
