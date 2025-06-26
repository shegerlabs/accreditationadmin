import { parseWithZod } from '@conform-to/zod'
import { createId as cuid } from '@paralleldrive/cuid2'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { validateCSRF } from '~/utils/csrf.server'
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

		const template = await prisma.template.delete({
			where: { id: submission.value.id },
			select: { id: true, eventId: true },
		})

		await deleteDirectory({
			containerName: 'accreditation',
			directoryName: `templates/${template.id}`,
		})

		return redirectWithToast(`/admin/events/${template.eventId}/templates`, {
			type: 'success',
			title: `Template Deleted`,
			description: `Template deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: TemplateEditorSchema.superRefine(async (data, ctx) => {
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
			attachments: {
				create: newAttachments.map(({ blob, ...attachment }) => attachment),
			},
		},
		update: {
			...data,
			name,
			description,
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

	return redirectWithToast(`/admin/events/${data.eventId}/templates`, {
		type: 'success',
		title: `Template ${templateId ? 'Updated' : 'Created'}`,
		description: `Template ${templateId ? 'updated' : 'created'} successfully.`,
	})
}
