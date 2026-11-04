import {
	getFormProps,
	getInputProps,
	FieldMetadata,
	useForm,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	Attachment,
	BadgeTemplate,
	Event,
	ParticipantType,
	Template,
} from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import {
	Form,
	useActionData,
	useNavigate,
	useOutletContext,
	useParams,
} from '@remix-run/react'
import { Prisma } from '@prisma/client'
import { PlusIcon, TrashIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import {
	DynamicBadge,
	ParticipantBadgeData,
	dbTemplateToConfig,
} from '~/components/badge-designer'
import { FileInputField } from '~/components/conform/FileInputField'
import { SelectField } from '~/components/conform/SelectField'
import { DocumentPreview } from '~/components/document-preview'
import { Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Label } from '~/components/ui/label'
import { getAttachmentFileSrc, useIsPending } from '~/utils/misc'
import { type action } from './__template-editor.server'

// Sample participant data for badge preview
const SAMPLE_PARTICIPANT: ParticipantBadgeData = {
	badgeId: 'SAMPLE-001234',
	firstName: 'John',
	familyName: 'Doe',
	fullName: 'John Doe',
	title: 'Mr.',
	organization: 'Sample Organization',
	jobTitle: 'Software Engineer',
	country: 'Ethiopia',
	nationality: 'Ethiopian',
	email: 'john.doe@example.com',
	participantType: 'Delegate',
	eventName: 'Sample Event 2025',
	profileUrl: 'https://example.com/profile/sample',
	photoUrl: '/placeholder-avatar.jpg',
}

// Badge template type with full details
type BadgeTemplateWithDetails = Pick<
	BadgeTemplate,
	| 'id'
	| 'name'
	| 'width'
	| 'height'
	| 'borderWidth'
	| 'borderColor'
	| 'borderRadius'
	| 'badgeIdPrefix'
> & {
	elements: Prisma.JsonValue
}

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
	badgeTemplateId: z
		.string()
		.optional()
		.transform(val => (val === '_none' ? undefined : val)),
	attachments: z.array(AttachmentFieldSetSchema).optional(),
})

export const TemplateDeleteSchema = z.object({
	id: z.string(),
})

export function TemplateEditor({
	event,
	template,
	title,
	intent = 'add',
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
			| 'badgeTemplateId'
		> & {
			attachments: Array<Pick<Attachment, 'id' | 'altText'>>
		}
	>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const { participantTypes, badgeTemplates } = useOutletContext<{
		participantTypes: ParticipantType[]
		badgeTemplates: (BadgeTemplateWithDetails & { isDefault?: boolean })[]
	}>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const navigate = useNavigate()
	const { eventId } = useParams()

	const isDelete = intent === 'delete'
	const schema = isDelete ? TemplateDeleteSchema : TemplateEditorSchema

	// Find the default badge template
	const defaultBadgeTemplate = badgeTemplates.find(t => t.isDefault)

	const [form, fields] = useForm({
		id: 'template-editor',
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
			badgeTemplateId: template?.badgeTemplateId ?? defaultBadgeTemplate?.id ?? '_none',
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

	const attachments = fields.attachments.getFieldList()

	// State for file preview URLs
	const [frontPreviewUrl, setFrontPreviewUrl] = useState<string | null>(null)
	const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null)

	// Get the selected badge template
	const selectedBadgeTemplateId = fields.badgeTemplateId.value
	const selectedBadgeTemplate = useMemo(() => {
		if (!selectedBadgeTemplateId || selectedBadgeTemplateId === '_none') {
			return null
		}
		return badgeTemplates.find(t => t.id === selectedBadgeTemplateId) ?? null
	}, [selectedBadgeTemplateId, badgeTemplates])

	// Get existing attachment URLs
	const existingFrontAttachment = template?.attachments.find(
		a => a.altText === 'Front',
	)
	const existingBackAttachment = template?.attachments.find(
		a => a.altText === 'Back',
	)

	// Compute the background URLs for preview
	const frontBackgroundUrl = useMemo(() => {
		if (frontPreviewUrl) return frontPreviewUrl
		if (existingFrontAttachment?.id) {
			return getAttachmentFileSrc(existingFrontAttachment.id)
		}
		return undefined
	}, [frontPreviewUrl, existingFrontAttachment?.id])

	const backBackgroundUrl = useMemo(() => {
		if (backPreviewUrl) return backPreviewUrl
		if (existingBackAttachment?.id) {
			return getAttachmentFileSrc(existingBackAttachment.id)
		}
		return undefined
	}, [backPreviewUrl, existingBackAttachment?.id])

	// Cleanup file preview URLs on unmount
	useEffect(() => {
		return () => {
			if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl)
			if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl)
		}
	}, [frontPreviewUrl, backPreviewUrl])

	// Handler for file changes to update preview
	const handleFileChange = useCallback(
		(altText: 'Front' | 'Back', file: File | null) => {
			if (altText === 'Front') {
				if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl)
				setFrontPreviewUrl(file ? URL.createObjectURL(file) : null)
			} else {
				if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl)
				setBackPreviewUrl(file ? URL.createObjectURL(file) : null)
			}
		},
		[frontPreviewUrl, backPreviewUrl],
	)

	const handleClose = () => navigate(`/admin/events/${eventId}/templates`)

	// Check if we should show the preview
	const showPreview =
		!isDelete && selectedBadgeTemplate && badgeTemplates.length > 0

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent
				className={
					showPreview
						? 'max-h-[90vh] overflow-y-auto sm:max-w-[1100px]'
						: 'max-h-[90vh] overflow-y-auto sm:max-w-[600px]'
				}
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{isDelete
							? 'Are you sure you want to delete this template? This action cannot be undone.'
							: intent === 'edit'
								? 'Update the template details below.'
								: 'Fill in the details to create a new template.'}
					</DialogDescription>
				</DialogHeader>

				<Form
					method="POST"
					encType="multipart/form-data"
					{...getFormProps(form)}
				>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<input
						{...getInputProps(fields.id, { type: 'hidden' })}
						key={fields.id.key}
					/>
					<input
						{...getInputProps(fields.eventId, { type: 'hidden' })}
						key={fields.eventId.key}
					/>
					<input
						{...getInputProps(fields.tenantId, { type: 'hidden' })}
						key={fields.tenantId.key}
					/>
					<input type="hidden" name="intent" value={intent} />

					{!isDelete && (
						<div
							className={
								showPreview
									? 'grid gap-6 py-4 lg:grid-cols-2'
									: 'grid gap-4 py-4'
							}
						>
							<div className="space-y-4">
								<Field>
									<Label htmlFor={fields.participantTypeId.id}>
										Participant Type
									</Label>
									<SelectField
										meta={fields.participantTypeId}
										items={participantTypes.map(participantType => ({
											name: participantType.name,
											value: participantType.id,
										}))}
										placeholder="Select Participant Type"
									/>
									{fields.participantTypeId.errors && (
										<FieldError>{fields.participantTypeId.errors}</FieldError>
									)}
								</Field>

								{badgeTemplates && badgeTemplates.length > 0 && (
									<Field>
										<Label htmlFor={fields.badgeTemplateId.id}>
											Badge Design
										</Label>
										<SelectField
											meta={fields.badgeTemplateId}
											items={[
												{ name: 'None (Use legacy layout)', value: '_none' },
												...badgeTemplates.map(t => ({
													name: t.name,
													value: t.id,
												})),
											]}
											placeholder="Select badge design"
										/>
										{fields.badgeTemplateId.errors && (
											<FieldError>{fields.badgeTemplateId.errors}</FieldError>
										)}
									</Field>
								)}

								<fieldset className="rounded-md border p-4">
									<div className="mb-4 flex space-x-4 border-b pb-2">
										<div className="flex-1">Attachments</div>
										<div className="flex-1">
											<div className="flex items-center justify-end">
												<Button
													{...form.insert.getButtonProps({
														name: fields.attachments.name,
													})}
													size="sm"
													type="button"
													className="ml-2"
												>
													<PlusIcon className="h-4 w-4" />
												</Button>
											</div>
										</div>
									</div>

									{attachments.map((attachment, index) => {
										return (
											<AttachmentField
												key={index}
												attachment={attachment}
												intent={intent}
												disabled={false}
												onFileChange={handleFileChange}
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
							</div>

							{/* Badge Preview Panel */}
							{showPreview && selectedBadgeTemplate && (
								<Card>
									<CardHeader className="py-3">
										<CardTitle className="text-lg">Badge Preview</CardTitle>
									</CardHeader>
									<CardContent>
										<DynamicBadge
											template={dbTemplateToConfig({
												width: selectedBadgeTemplate.width,
												height: selectedBadgeTemplate.height,
												borderWidth: selectedBadgeTemplate.borderWidth,
												borderColor: selectedBadgeTemplate.borderColor,
												borderRadius: selectedBadgeTemplate.borderRadius,
												badgeIdPrefix: selectedBadgeTemplate.badgeIdPrefix,
												elements: selectedBadgeTemplate.elements,
											})}
											participant={SAMPLE_PARTICIPANT}
											frontBackgroundUrl={frontBackgroundUrl}
											backBackgroundUrl={backBackgroundUrl}
											height="320px"
										/>
									</CardContent>
								</Card>
							)}
						</div>
					)}

					{isDelete && (
						<div className="py-4">
							<p className="text-sm text-muted-foreground">
								This will permanently delete this template and all its
								attachments. This action cannot be undone.
							</p>
						</div>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={handleClose}>
							Cancel
						</Button>
						<Button
							type="submit"
							variant={isDelete ? 'destructive' : 'default'}
							disabled={isPending}
						>
							{isPending
								? isDelete
									? 'Deleting...'
									: 'Saving...'
								: isDelete
									? 'Delete'
									: 'Save'}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}

export function AttachmentField({
	attachment,
	intent,
	disabled,
	onFileChange,
	actions,
}: {
	attachment: FieldMetadata<AttachmentFieldSet>
	intent: 'add' | 'edit' | 'delete'
	disabled: boolean
	onFileChange?: (altText: 'Front' | 'Back', file: File | null) => void
	actions: {
		onRemove: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void
	}
}) {
	const attachmentFields = attachment.getFieldset()
	const existingFile = Boolean(attachmentFields.id.initialValue)
	const link = getAttachmentFileSrc(attachmentFields.id.initialValue ?? '')
	const altText = attachmentFields.altText.initialValue as 'Front' | 'Back'

	return (
		<div className="mb-4 flex items-center space-x-4">
			{existingFile ? (
				<>
					<input
						type="hidden"
						name={attachmentFields.id.name}
						value={attachmentFields.id.initialValue}
					/>
					<input
						type="hidden"
						name={attachmentFields.altText.name}
						value={attachmentFields.altText.initialValue}
					/>
					<div className="flex-1">
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
					<input
						type="hidden"
						name={attachmentFields.altText.name}
						value={attachmentFields.altText.initialValue}
					/>

					<Label htmlFor={attachmentFields.file.id}>
						{attachmentFields.altText.initialValue}
					</Label>

					<div
						onChange={(e: React.ChangeEvent<HTMLDivElement>) => {
							const input = e.target as HTMLInputElement
							if (input.type === 'file' && onFileChange) {
								const file = input.files?.[0] ?? null
								onFileChange(altText, file)
							}
						}}
					>
						<FileInputField
							meta={attachmentFields.file}
							disabled={disabled}
							autoComplete="off"
						/>
					</div>
				</>
			)}
			{intent === 'delete' ? null : (
				<Button
					onClick={actions.onRemove}
					variant="destructive"
					size="sm"
					type="button"
				>
					<TrashIcon className="h-4 w-4" />
				</Button>
			)}
		</div>
	)
}
