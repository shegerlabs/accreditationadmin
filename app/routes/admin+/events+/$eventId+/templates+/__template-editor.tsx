import { FieldMetadata, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Attachment, Event, ParticipantType, Template } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData, useOutletContext } from '@remix-run/react'
import { PlusIcon, TrashIcon } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { FileInputField } from '~/components/conform/FileInputField'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { DocumentPreview } from '~/components/document-preview'
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { getAttachmentFileSrc, useIsPending } from '~/utils/misc'
import { type action } from './__template-editor.server'

const MAX_UPLOAD_SIZE = 1024 * 1024 * 3 // 3MB

const AttachmentFieldSetSchema = z.object({
	id: z.string().optional(),
	file: z
		.instanceof(File)
		.optional()
		.refine(file => !file || file.size <= MAX_UPLOAD_SIZE, {
			message: 'File size must be less than 3MB',
		}),
	altText: z.enum(['Front', 'Back']),
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

export const TemplateEditorSchema = z.object({
	id: z.string().optional(),
	name: z.string().optional(),
	description: z.string().optional(),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	eventId: z.string({ required_error: 'Event is required' }),
	participantTypeId: z.string({
		required_error: 'Participant Type is required',
	}),
	templateType: z.enum(['BADGE', 'FLYER', 'BANNER', 'LOGO']).default('BADGE'),
	attachments: z.array(AttachmentFieldSetSchema).optional(),
})

export const TemplateDeleteSchema = z.object({
	id: z.string(),
})

export function TemplateEditor({
	event,
	template,
	title,
	intent,
}: {
	event: SerializeFrom<Pick<Event, 'id' | 'name' | 'tenantId'>>
	template?: SerializeFrom<
		Pick<
			Template,
			| 'id'
			| 'name'
			| 'description'
			| 'tenantId'
			| 'eventId'
			| 'participantTypeId'
			| 'templateType'
		> & {
			attachments: Array<Pick<Attachment, 'id' | 'altText'>>
		}
	>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const { participantTypes } = useOutletContext<{
		participantTypes: ParticipantType[]
	}>()
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema =
		intent === 'delete' ? TemplateDeleteSchema : TemplateEditorSchema
	const [form, fields] = useForm({
		id: 'register-template',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...template,
			eventId: event.id,
			tenantId: event.tenantId,
			templateType: template?.templateType ?? 'BADGE',
			attachments: (() => {
				const required = ['Front', 'Back']
				const existing = template?.attachments || []
				if (!existing.length) {
					return required.map(altText => ({
						id: '',
						file: null,
						altText,
					}))
				}

				const missing = required.filter(
					altText => !existing.some(a => a.altText === altText),
				)

				return [
					...existing,
					...missing.map(altText => ({ id: '', file: null, altText })),
				]
			})(),
		},
	})

	const isPending = useIsPending()

	const attachments = fields.attachments.getFieldList()

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this template? This action cannot be undone.'
					: undefined
			}
			formId={form.id}
			onSubmit={form.onSubmit}
			buttons={[
				{
					label: intent === 'delete' ? 'Delete' : 'Save',
					intent: intent,
					variant: intent === 'delete' ? 'destructive' : 'default',
					type: 'submit',
					disabled: isPending,
					status: isPending ? 'pending' : (form.status ?? 'idle'),
				},
				{
					label: 'Cancel',
					to: `/admin/events/${event.id}/templates`,
					type: 'link',
				},
			]}
			encType="multipart/form-data"
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />
			<InputField meta={fields.eventId} type="hidden" />
			<InputField meta={fields.tenantId} type="hidden" />

			<Field>
				<Label htmlFor={fields.participantTypeId.id}>Participant Type</Label>
				<SelectField
					meta={fields.participantTypeId}
					items={participantTypes.map(participantType => ({
						name: participantType.name,
						value: participantType.id,
					}))}
					disabled={disabled}
					placeholder="Select Participant Type"
					onValueChange={value => {
						const participantType = participantTypes.find(
							pt => pt.id === fields.participantTypeId.value,
						)
						if (participantType) {
							const newName = `${participantType.name} ${value}`
							form.initialValue = {
								...form.initialValue,
								name: newName,
							}
						}
					}}
				/>
				{fields.participantTypeId.errors && (
					<FieldError>{fields.participantTypeId.errors}</FieldError>
				)}
			</Field>

			{/* <Field>
				<Label htmlFor={fields.name.id}>Name</Label>
				<InputField
					meta={fields.name}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.name.errors && <FieldError>{fields.name.errors}</FieldError>}
			</Field>

			<Field>
				<Label htmlFor={fields.description.id}>Description</Label>
				<InputField
					meta={fields.description}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.description.errors && (
					<FieldError>{fields.description.errors}</FieldError>
				)}
			</Field> */}

			{/* <Field>
				<Label htmlFor={fields.templateType.id}>Template Type</Label>
				<SelectField
					meta={fields.templateType}
					items={['BADGE', 'FLYER', 'BANNER', 'LOGO'].map(templateType => ({
						name: templateType,
						value: templateType,
					}))}
					disabled={disabled}
					placeholder="Select Template Type"
				/>
				{fields.templateType.errors && (
					<FieldError>{fields.templateType.errors}</FieldError>
				)}
			</Field> */}
			<fieldset className="rounded-md border p-4" key="attachments">
				<div className="mb-4 flex space-x-4 border-b pb-2">
					<div className="flex-1">Attachments</div>
					<div className="flex-1">
						<div
							className={
								['add', 'edit'].includes(intent ?? 'add')
									? 'flex items-center justify-end'
									: ''
							}
						>
							{['add', 'edit'].includes(intent ?? 'add') && (
								<Button
									{...form.insert.getButtonProps({
										name: fields.attachments.name,
									})}
									size="sm"
									className="ml-2"
								>
									<PlusIcon className="h-4 w-4" />
								</Button>
							)}
						</div>
					</div>
				</div>

				{attachments.map((attachment, index) => {
					return (
						<AttachmentField
							key={index}
							attachment={attachment}
							intent={intent ?? 'add'}
							disabled={disabled}
							actions={{
								onRemove: event => {
									event.preventDefault()
									form.remove({
										name: fields.attachments.name,
										index,
									})
								},
							}}
						/>
					)
				})}
			</fieldset>
		</FormCard>
	)
}

export function AttachmentField({
	attachment,
	intent,
	disabled,
	actions,
}: {
	attachment: FieldMetadata<AttachmentFieldSet>
	intent: 'add' | 'edit' | 'delete'
	disabled: boolean
	actions: {
		onRemove: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void
	}
}) {
	const attachmentFields = attachment.getFieldset()
	const existingFile = Boolean(attachmentFields.id.initialValue)
	const link = getAttachmentFileSrc(attachmentFields.id.initialValue ?? '')

	return (
		<div className="mb-4 flex items-center space-x-4">
			{existingFile ? (
				<>
					<InputField meta={attachmentFields.id} type="hidden" />
					<InputField meta={attachmentFields.altText} type="hidden" />
					<div className="flex-1">
						{/* <a
							href={link}
							target="_blank"
							rel="noreferrer"
							className="flex items-center gap-2 space-x-2 font-medium text-green-600 hover:text-green-500"
						>
							<PaperclipIcon className="h-4 w-4" />
							{attachmentFields.altText.initialValue}
						</a> */}
						<DocumentPreview
							title={`${attachmentFields.altText.initialValue}`}
							documentUrl={link}
							contentType="image/png"
							type={attachmentFields.altText.initialValue as 'Front' | 'Back'}
							onDownload={() => {
								window.open(link, '_blank')
							}}
						/>
					</div>
				</>
			) : (
				<>
					<InputField meta={attachmentFields.altText} type="hidden" />

					<Label htmlFor={attachmentFields.file.id}>
						{attachmentFields.altText.initialValue}
					</Label>

					<FileInputField
						meta={attachmentFields.file}
						disabled={disabled}
						autoComplete="off"
					/>
				</>
			)}
			{intent === 'delete' ? null : (
				<Button onClick={actions.onRemove} variant="destructive" size="sm">
					<TrashIcon className="h-4 w-4" />
				</Button>
			)}
		</div>
	)
}
