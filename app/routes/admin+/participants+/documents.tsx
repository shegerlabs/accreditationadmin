import { createId as cuid } from '@paralleldrive/cuid2'
import { ApprovalResult, RequestStatus } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { parseWithZod } from 'node_modules/@conform-to/zod/parse'
import { z } from 'zod'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { registrationWizard } from '~/utils/registration.server'
import { deleteFileIfExists, uploadFile } from '~/utils/storage.server'
import { redirectWithToast } from '~/utils/toast.server'
import {
	attachmentHasFile,
	attachmentHasId,
	DocumentsEditor,
	DocumentsEditorSchema,
} from './__documents-editor'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, [
		'focal',
		'admin',
		'reviewer',
		'first-validator',
		'second-validator',
		'printer',
	])

	const { data } = await registrationWizard.register(request)
	const participant = data?.participant?.id
		? await prisma.participant.findUnique({
				where: {
					id: data?.participant?.id,
				},
				select: {
					participantType: {
						select: {
							templates: {
								select: {
									attachments: true,
								},
							},
						},
					},
				},
			})
		: null

	return json({
		data,
		templates: participant?.participantType.templates,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, [
		'focal',
		'admin',
		'reviewer',
		'first-validator',
		'second-validator',
		'printer',
	])
	const {
		data: info,
		destroy,
		prevStep,
	} = await registrationWizard.register(request)
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')
	if (intent === 'cancel') {
		const headers = await destroy()
		return redirectWithToast(
			'/admin/participants',
			{
				type: 'success',
				title: `Cancelled`,
				description: `Participant registration cancelled.`,
			},
			{ headers },
		)
	}

	if (intent === 'prev') {
		return prevStep()
	}

	const submission = await parseWithZod(formData, {
		schema: DocumentsEditorSchema.superRefine(async (data, ctx) => {
			const participant = await prisma.participant.findUnique({
				where: {
					tenantId_eventId_participantTypeId_email: {
						eventId: info.general.eventId,
						tenantId: info.general.tenantId,
						participantTypeId: info.general.participantTypeId,
						email: info.professional.email,
					},
				},
				select: { id: true },
			})

			if (participant && participant.id !== info.participant.id) {
				ctx.addIssue({
					path: ['tenantId'],
					code: z.ZodIssueCode.custom,
					message: 'Participant already exists.',
				})
				return
			}
		}).transform(async ({ documents = [], ...data }) => {
			return {
				id: info?.participant?.id,
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
								altText: `${image.file.name}`,
								contentType: image.file.type,
								documentType: image.documentType,
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

	const { id: participantId, updatedDocuments, newDocuments } = submission.value

	const deletedDocuments = await prisma.participantDocument.findMany({
		select: { fileName: true, extension: true },
		where: { id: { notIn: updatedDocuments.map(i => i.id) } },
	})

	const { meetings, ...rest } = info.wishlist

	const wishlist = {
		...rest,
		wishList: meetings.join(','),
	}

	const requestReceived = await prisma.step.findFirstOrThrow({
		where: { name: 'Request Received' },
	})

	const data = {
		...info.general,
		...info.professional,
		...wishlist,
		stepId: requestReceived.id,
		status: RequestStatus.PENDING,
	}

	const participant = await prisma.participant.upsert({
		select: { id: true },
		where: { id: participantId ?? '__new_participant__' },
		create: {
			...data,
			documents: {
				create: newDocuments.map(({ blob, ...attachment }) => attachment),
			},
			approvals: {
				create: {
					stepId: requestReceived.id,
					result: ApprovalResult.SUCCESS,
					userId: user.id,
					remarks: 'Request Received',
				},
			},
		},
		update: {
			...data,
			documents: {
				deleteMany: { id: { notIn: updatedDocuments.map(i => i.id) } },
				updateMany: updatedDocuments.map(({ blob, ...updates }) => ({
					where: { id: updates.id },
					data: { ...updates, id: blob ? cuid() : updates.id },
				})),
				create: newDocuments.map(({ blob, ...attachment }) => attachment),
			},
		},
	})

	const deletePromises = deletedDocuments.map(attachment =>
		deleteFileIfExists({
			containerName: 'accreditation',
			prefix: `participants/${participant.id}`,
			fileName: attachment.fileName,
		}),
	)

	const updatePromises = updatedDocuments.map(attachment => {
		if (attachment.blob) {
			return uploadFile({
				containerName: 'accreditation',
				directory: `participants/${participant.id}`,
				fileName: attachment.fileName,
				extension: attachment.extension,
				blob: attachment.blob,
			})
		}
		return Promise.resolve()
	})

	const newAttachmentsPromises = newDocuments.map(attachment =>
		uploadFile({
			containerName: 'accreditation',
			directory: `participants/${participant.id}`,
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

	const sessionHeaders = await destroy()

	return redirectWithToast(
		'/admin/participants',
		{
			type: 'success',
			title: `Participant Created`,
			description: `Participant created successfully.`,
		},
		{
			headers: sessionHeaders,
		},
	)
}

export default function AddDocumentsRoute() {
	const { data } = useLoaderData<typeof loader>()

	const participant = {
		id: data?.participant?.id,
		documents: data.documents,
	}
	return <DocumentsEditor intent="add" participant={participant} />
}
