import { FieldMetadata, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	Event,
	Participant,
	ParticipantDocument,
	ParticipantType,
	Tenant,
} from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData, useOutletContext } from '@remix-run/react'
import { CheckIcon, PaperclipIcon } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { FileInputField } from '~/components/conform/FileInputField'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { getAttachmentFileSrc, useIsPending } from '~/utils/misc'
import { type action } from './__participant-editor.server'
// import { CheckIcon } from '@heroicons/react/24/solid'

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

export const ParticipantEditorSchema = z.object({
	id: z.string().optional(),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	eventId: z.string({ required_error: 'Event is required' }),
	participantTypeId: z.string({
		required_error: 'Participant Type is required',
	}),
	gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
	title: z.string().optional(),
	firstName: z.string({ required_error: 'First Name is required' }),
	familyName: z.string({ required_error: 'Family Name is required' }),
	dateOfBirth: z.string({ required_error: 'Date of Birth is required' }),
	nationality: z.string({ required_error: 'Nationality is required' }),
	passportNumber: z.string({ required_error: 'Passport Number is required' }),
	passportExpiry: z.string({ required_error: 'Passport Expiry is required' }),
	organization: z.string({ required_error: 'Organization is required' }),
	jobTitle: z.string({ required_error: 'Job Title is required' }),
	country: z.string({ required_error: 'Country is required' }),
	city: z.string({ required_error: 'City is required' }),
	email: z.string({ required_error: 'Email is required' }),
	website: z.string().optional(),
	telephone: z.string().optional(),
	address: z.string().optional(),
	preferredLanguage: z.enum([
		'ENGLISH',
		'FRENCH',
		'PORTUGUESE',
		'ARABIC',
		'SWAHLI',
		'OTHER',
	]),
	needsVisa: z.boolean(),
	needsCarPass: z.boolean(),
	vehicleType: z.string().optional(),
	vehiclePlateNumber: z.string().optional(),
	needsCarFromOrganizer: z.boolean(),
	flightNumber: z.string().optional(),
	arrivalDate: z.string().optional(),
	wishList: z.string().optional(),
	documents: z.array(AttachmentFieldSetSchema),
})

export const ParticipantDeleteSchema = z.object({
	id: z.string(),
})

export function ParticipantEditor({
	participant,
	title,
	intent,
}: {
	participant?: SerializeFrom<
		Pick<Participant, 'id' | 'tenantId' | 'eventId' | 'participantTypeId'> & {
			documents: Array<
				Pick<ParticipantDocument, 'id' | 'altText' | 'documentType'>
			>
		}
	>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const { tenants, events, participantTypes } = useOutletContext<{
		tenants: Tenant[]
		events: Event[]
		participantTypes: ParticipantType[]
	}>()
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema =
		intent === 'delete' ? ParticipantDeleteSchema : ParticipantEditorSchema
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
			documents: participant?.documents ?? [
				{
					id: '',
					file: null,
					altText: 'Passport',
					documentType: 'PASSPORT',
				},
				{
					id: '',
					file: null,
					altText: 'Photo',
					documentType: 'PHOTO',
				},
				{
					id: '',
					file: null,
					altText: 'Invitation Letter',
					documentType: 'LETTER',
				},
			],
		},
	})

	const documents = fields.documents.getFieldList()

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this participant? This action cannot be undone.'
					: undefined
			}
			formId={form.id}
			onSubmit={form.onSubmit}
			buttons={[
				// {
				// 	label: 'Submit',
				// 	intent: 'documents',
				// 	variant: 'default',
				// 	disabled: isPending,
				// 	status: actionData?.result.status,
				// 	type: 'submit',
				// },

				{
					label: intent === 'delete' ? 'Delete' : 'Submit',
					intent: intent,
					variant: intent === 'delete' ? 'destructive' : 'default',
					type: 'submit',
					disabled: isPending,
				},
				{
					label: 'Cancel',
					to: '/admin/participants',
					type: 'link',
				},
			]}
			encType="multipart/form-data"
		>
			<Example />
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />
			<Field>
				<Label htmlFor={fields.tenantId.id}>Tenant</Label>
				<SelectField
					meta={fields.tenantId}
					items={tenants.map(tenant => ({
						name: tenant.name,
						value: tenant.id,
					}))}
					placeholder="Select Tenant"
				/>
				{fields.tenantId.errors && (
					<FieldError>{fields.tenantId.errors}</FieldError>
				)}
			</Field>
			<Field>
				<Label htmlFor={fields.eventId.id}>Event</Label>
				<SelectField
					meta={fields.eventId}
					items={events.map(event => ({
						name: event.name,
						value: event.id,
					}))}
					placeholder="Select Event"
				/>
				{fields.eventId.errors && (
					<FieldError>{fields.eventId.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.participantTypeId.id}>Participant Type</Label>
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

			<Field>
				<Label htmlFor={fields.firstName.id}>First Name</Label>
				<InputField
					meta={fields.firstName}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.firstName.errors && (
					<FieldError>{fields.firstName.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.familyName.id}>Family Name</Label>
				<InputField
					meta={fields.familyName}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.familyName.errors && (
					<FieldError>{fields.familyName.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.gender.id}>Gender</Label>
				<SelectField
					meta={fields.gender}
					items={['MALE', 'FEMALE', 'OTHER'].map(gender => ({
						name: gender,
						value: gender,
					}))}
					placeholder="Select Gender"
				/>
				{fields.gender.errors && (
					<FieldError>{fields.gender.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.title.id}>Title</Label>
				<InputField
					meta={fields.title}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.title.errors && <FieldError>{fields.title.errors}</FieldError>}
			</Field>

			<Field>
				<Label htmlFor={fields.dateOfBirth.id}>Date of Birth</Label>
				<InputField meta={fields.dateOfBirth} type="date" disabled={disabled} />
				{fields.dateOfBirth.errors && (
					<FieldError>{fields.dateOfBirth.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.nationality.id}>Nationality</Label>
				<InputField meta={fields.nationality} type="text" disabled={disabled} />
				{fields.nationality.errors && (
					<FieldError>{fields.nationality.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.passportNumber.id}>Passport Number</Label>
				<InputField
					meta={fields.passportNumber}
					type="text"
					disabled={disabled}
				/>
				{fields.passportNumber.errors && (
					<FieldError>{fields.passportNumber.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.passportExpiry.id}>Passport Expiry</Label>
				<InputField
					meta={fields.passportExpiry}
					type="date"
					disabled={disabled}
				/>
				{fields.passportExpiry.errors && (
					<FieldError>{fields.passportExpiry.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.organization.id}>Organization</Label>
				<InputField
					meta={fields.organization}
					type="text"
					disabled={disabled}
				/>
				{fields.organization.errors && (
					<FieldError>{fields.organization.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.jobTitle.id}>Job Title</Label>
				<InputField meta={fields.jobTitle} type="text" disabled={disabled} />
				{fields.jobTitle.errors && (
					<FieldError>{fields.jobTitle.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.country.id}>Country</Label>
				<InputField meta={fields.country} type="text" disabled={disabled} />
				{fields.country.errors && (
					<FieldError>{fields.country.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.city.id}>City</Label>
				<InputField meta={fields.city} type="text" disabled={disabled} />
				{fields.city.errors && <FieldError>{fields.city.errors} </FieldError>}
			</Field>

			<Field>
				<Label htmlFor={fields.email.id}>Email</Label>
				<InputField meta={fields.email} type="email" disabled={disabled} />
				{fields.email.errors && <FieldError>{fields.email.errors}</FieldError>}
			</Field>

			<Field>
				<Label htmlFor={fields.website.id}>Website</Label>
				<InputField meta={fields.website} type="text" disabled={disabled} />
				{fields.website.errors && (
					<FieldError>{fields.website.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.telephone.id}>Telephone</Label>
				<InputField meta={fields.telephone} type="text" disabled={disabled} />
				{fields.telephone.errors && (
					<FieldError>{fields.telephone.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.address.id}>Address</Label>
				<InputField meta={fields.address} type="text" disabled={disabled} />
				{fields.address.errors && (
					<FieldError>{fields.address.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.preferredLanguage.id}>Preferred Language</Label>
				<SelectField
					meta={fields.preferredLanguage}
					items={[
						'ENGLISH',
						'FRENCH',
						'PORTUGUESE',
						'ARABIC',
						'SWAHLI',
						'OTHER',
					].map(language => ({
						name: language,
						value: language,
					}))}
					placeholder="Select Preferred Language"
				/>
				{fields.preferredLanguage.errors && (
					<FieldError>{fields.preferredLanguage.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.needsVisa.id}>Needs Visa</Label>
				<SelectField
					meta={fields.needsVisa}
					items={['YES', 'NO'].map(needsVisa => ({
						name: needsVisa,
						value: needsVisa,
					}))}
					placeholder="Select Needs Visa"
				/>
				{fields.needsVisa.errors && (
					<FieldError>{fields.needsVisa.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.needsCarPass.id}>Needs Car Pass</Label>
				<SelectField
					meta={fields.needsCarPass}
					items={['YES', 'NO'].map(needsCarPass => ({
						name: needsCarPass,
						value: needsCarPass,
					}))}
					placeholder="Select Needs Car Pass"
				/>
				{fields.needsCarPass.errors && (
					<FieldError>{fields.needsCarPass.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.vehicleType.id}>Vehicle Type</Label>
				<InputField meta={fields.vehicleType} type="text" disabled={disabled} />
				{fields.vehicleType.errors && (
					<FieldError>{fields.vehicleType.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.vehiclePlateNumber.id}>
					Vehicle Plate Number
				</Label>
				<InputField
					meta={fields.vehiclePlateNumber}
					type="text"
					disabled={disabled}
				/>
				{fields.vehiclePlateNumber.errors && (
					<FieldError>{fields.vehiclePlateNumber.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.needsCarFromOrganizer.id}>
					Needs Car From Organizer
				</Label>
				<SelectField
					meta={fields.needsCarFromOrganizer}
					items={['YES', 'NO'].map(needsCarFromOrganizer => ({
						name: needsCarFromOrganizer,
						value: needsCarFromOrganizer,
					}))}
					placeholder="Select Needs Car From Organizer"
				/>
				{fields.needsCarFromOrganizer.errors && (
					<FieldError>{fields.needsCarFromOrganizer.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.flightNumber.id}>Flight Number</Label>
				<InputField
					meta={fields.flightNumber}
					type="text"
					disabled={disabled}
				/>
				{fields.flightNumber.errors && (
					<FieldError>{fields.flightNumber.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.arrivalDate.id}>Arrival Date</Label>
				<InputField meta={fields.arrivalDate} type="date" disabled={disabled} />
				{fields.arrivalDate.errors && (
					<FieldError>{fields.arrivalDate.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.wishList.id}>Wish List</Label>
				<InputField meta={fields.wishList} type="text" disabled={disabled} />
				{fields.wishList.errors && (
					<FieldError>{fields.wishList.errors}</FieldError>
				)}
			</Field>

			<fieldset className="rounded-md border p-4" key="documents">
				<div className="mb-4 flex space-x-4 border-b pb-2">
					<div className="flex-1">Upload Relevant Documents</div>
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
	const link = getAttachmentFileSrc(documentFields.id.initialValue ?? '')

	return (
		<div className="mb-4 flex items-center space-x-4">
			{existingFile ? (
				<>
					<InputField meta={documentFields.id} type="hidden" />
					<div className="flex-1">
						<a
							href={link}
							className="flex items-center gap-2 space-x-2 font-medium text-green-600 hover:text-green-500"
						>
							<PaperclipIcon className="h-4 w-4" />
							{documentFields.altText.initialValue}
						</a>
					</div>
				</>
			) : (
				<div className="mx-auto w-full">
					<InputField meta={documentFields.documentType} type="hidden" />

					<Field>
						<Label htmlFor={documentFields.file.id}>
							{documentFields.altText.initialValue}
						</Label>
						<FileInputField meta={documentFields.file} disabled={disabled} />
						{documentFields.file.errors && (
							<FieldError>{documentFields.file.errors}</FieldError>
						)}
					</Field>
				</div>
			)}
		</div>
	)
}

const steps = [
	{ id: '01', name: 'Job details', href: '#', status: 'complete' },
	{ id: '02', name: 'Application form', href: '#', status: 'current' },
	{ id: '03', name: 'Preview', href: '#', status: 'upcoming' },
]

export function Example() {
	return (
		<nav aria-label="Progress">
			<ol className="divide-y divide-gray-300 rounded-md border border-gray-300 md:flex md:divide-y-0">
				{steps.map((step, stepIdx) => (
					<li key={step.name} className="relative md:flex md:flex-1">
						{step.status === 'complete' ? (
							<a href={step.href} className="group flex w-full items-center">
								<span className="flex items-center px-6 py-4 text-sm font-medium">
									<span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-600 group-hover:bg-green-800">
										<CheckIcon
											aria-hidden="true"
											className="h-6 w-6 text-white"
										/>
									</span>
									<span className="ml-4 text-sm font-medium text-gray-900">
										{step.name}
									</span>
								</span>
							</a>
						) : step.status === 'current' ? (
							<a
								href={step.href}
								aria-current="step"
								className="flex items-center px-6 py-4 text-sm font-medium"
							>
								<span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-green-600">
									<span className="text-green-600">{step.id}</span>
								</span>
								<span className="ml-4 text-sm font-medium text-green-600">
									{step.name}
								</span>
							</a>
						) : (
							<a href={step.href} className="group flex items-center">
								<span className="flex items-center px-6 py-4 text-sm font-medium">
									<span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-300 group-hover:border-gray-400">
										<span className="text-gray-500 group-hover:text-gray-900">
											{step.id}
										</span>
									</span>
									<span className="ml-4 text-sm font-medium text-gray-500 group-hover:text-gray-900">
										{step.name}
									</span>
								</span>
							</a>
						)}

						{stepIdx !== steps.length - 1 ? (
							<>
								{/* Arrow separator for lg screens and up */}
								<div
									aria-hidden="true"
									className="absolute right-0 top-0 hidden h-full w-5 md:block"
								>
									<svg
										fill="none"
										viewBox="0 0 22 80"
										preserveAspectRatio="none"
										className="h-full w-full text-gray-300"
									>
										<path
											d="M0 -2L20 40L0 82"
											stroke="currentcolor"
											vectorEffect="non-scaling-stroke"
											strokeLinejoin="round"
										/>
									</svg>
								</div>
							</>
						) : null}
					</li>
				))}
			</ol>
		</nav>
	)
}
