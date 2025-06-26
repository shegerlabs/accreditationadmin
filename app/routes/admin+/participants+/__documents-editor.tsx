import { FieldMetadata, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Participant, ParticipantDocument } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData } from '@remix-run/react'
import { PaperclipIcon, TrashIcon } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { FileInputField } from '~/components/conform/FileInputField'
import { InputField } from '~/components/conform/InputField'
import { FormCard } from '~/components/form-card'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { getParticipantDocumentFileSrc, useIsPending } from '~/utils/misc'
import { useOptionalUser, userHasRoles } from '~/utils/user'
import { type action } from './documents'

const MAX_UPLOAD_SIZE = 1024 * 1024 * 3 // 3MB

const AttachmentFieldSetSchema = z.object({
	id: z.string().optional(),
	file: z
		.instanceof(File)
		.optional()
		.refine(file => !file || file.size <= MAX_UPLOAD_SIZE, {
			message: 'File size must be less than 3MB',
		}),
	altText: z.string().optional(),
	documentType: z.enum(['PASSPORT', 'PHOTO', 'LETTER']),
})

type AttachmentFieldSet = z.infer<typeof AttachmentFieldSetSchema>

export function attachmentHasFile(
	attachment: AttachmentFieldSet,
): attachment is AttachmentFieldSet & {
	file: NonNullable<AttachmentFieldSet['file']>
} {
	return Boolean(attachment.file?.size && attachment.file.size > 0)
}

export function attachmentHasId(
	attachment: AttachmentFieldSet,
): attachment is AttachmentFieldSet & {
	id: NonNullable<AttachmentFieldSet['id']>
} {
	return attachment.id != null
}

export const DocumentsEditorSchema = z.object({
	id: z.string().optional(),
	documents: z.array(AttachmentFieldSetSchema),
})

export function DocumentsEditor({
	participant,
	intent,
}: {
	participant?: SerializeFrom<
		Pick<Participant, 'id'> & {
			documents: Array<
				Pick<
					ParticipantDocument,
					| 'id'
					| 'altText'
					| 'documentType'
					| 'contentType'
					| 'fileName'
					| 'extension'
				>
			>
			participantType: any
		}
	>
	intent?: 'add' | 'edit' | 'delete'
}) {
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema = DocumentsEditorSchema
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'register-participant',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...participant,
			documents:
				participant?.documents && participant.documents.length > 0
					? participant.documents
					: [
							{
								id: '',
								file: null,
								altText: 'Passport',
								documentType: 'PASSPORT',
							},
							{
								id: '',
								altText: 'Photo',
								documentType: 'PHOTO',
							},
							{
								id: '',
								altText: 'Invitation Letter',
								documentType: 'LETTER',
							},
						],
		},
	})

	const documents = fields.documents.getFieldList()
	const user = useOptionalUser()

	return (
		<FormCard
			formId={form.id}
			onSubmit={form.onSubmit}
			buttons={[
				{
					label: 'Prev',
					intent: 'prev',
					variant: 'default',
					disabled: isPending,
					status: actionData?.result.status,
					type: 'submit',
				},
				...(userHasRoles(user, [
					'focal',
					'admin',
					'reviewer',
					'mofa-validator',
					'niss-validator',
					'mofa-printer',
					'first-validator',
					'second-validator',
					'printer',
				])
					? ([
							{
								label: 'Submit',
								intent: 'documents',
								variant: 'default',
								disabled: isPending,
								status: actionData?.result.status,
								type: 'submit',
							},
						] as any)
					: ([] as any)),
				{
					label: 'Cancel',
					to: '/admin/participants/cancel',
					type: 'link',
				},
			]}
			encType="multipart/form-data"
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />

			<fieldset className="rounded-md border p-4" key="documents">
				<div className="mb-4 flex space-x-4 border-b pb-2">
					<div className="flex-1">Supporting Documents</div>
				</div>

				{documents.map((document, index) => {
					return (
						<AttachmentField
							key={index}
							document={document}
							intent={intent ?? 'add'}
							disabled={disabled}
							actions={{
								onRemove: event => {
									event.preventDefault()
									form.remove({
										name: fields.documents.name,
										index,
									})
								},
							}}
						/>
					)
				})}
			</fieldset>

			<ErrorList errors={form.errors} />
		</FormCard>
	)
}

export function AttachmentField({
	document,
	intent,
	disabled,
	actions,
}: {
	document: FieldMetadata<AttachmentFieldSet>
	intent: 'add' | 'edit' | 'delete'
	disabled: boolean
	actions: {
		onRemove: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void
	}
}) {
	const documentFields = document.getFieldset()
	const existingFile = Boolean(documentFields.id.initialValue)
	const link = getParticipantDocumentFileSrc(
		documentFields.id.initialValue ?? '',
	)
	const user = useOptionalUser()

	return (
		<div className="mb-4 flex items-center space-x-4">
			{existingFile ? (
				<>
					<InputField meta={documentFields.id} type="hidden" />
					<InputField meta={documentFields.documentType} type="hidden" />
					<div className="flex-1">
						<a
							href={link}
							className="flex items-center gap-2 space-x-2 font-medium text-green-600 hover:text-green-500"
						>
							<PaperclipIcon className="h-4 w-4" />
							{documentFields.documentType.initialValue}
						</a>
					</div>
					{userHasRoles(user, ['focal', 'admin']) && (
						<Button onClick={actions.onRemove} variant="destructive" size="sm">
							<TrashIcon className="h-4 w-4" />
						</Button>
					)}
				</>
			) : (
				<div className="mx-auto w-full">
					<InputField meta={documentFields.documentType} type="hidden" />

					<Field>
						<Label htmlFor={documentFields.file.id}>
							{documentFields.altText.initialValue}
						</Label>
						<FileInputField
							meta={documentFields.file}
							disabled={disabled}
							autoComplete="off"
						/>
						{documentFields.file.errors && (
							<FieldError>{documentFields.file.errors}</FieldError>
						)}
					</Field>
				</div>
			)}
		</div>
	)
}
