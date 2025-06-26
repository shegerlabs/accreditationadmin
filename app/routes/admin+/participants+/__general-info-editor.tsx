import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	Country,
	Event,
	Participant,
	ParticipantDocument,
	ParticipantType,
	Tenant,
} from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData, useOutletContext } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { DatePickerField } from '~/components/conform/DatePickerField'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { getParticipantDocumentFileSrc, useIsPending } from '~/utils/misc'
import { action } from './general'

export const GeneralInfoEditorSchema = z.object({
	id: z.string().optional(),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	eventId: z.string({ required_error: 'Event is required' }),
	participantTypeId: z.string({
		required_error: 'Participant Type is required',
	}),
	gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
	title: z.enum(['MR.', 'MRS.', 'MS.', 'DR.', 'PhD.', 'H.E.', 'H.M']),
	firstName: z.string({ required_error: 'First Name is required' }),
	familyName: z.string({ required_error: 'Family Name is required' }),
	dateOfBirth: z.date({ required_error: 'Date of Birth is required' }),
	nationalityId: z.string({ required_error: 'Nationality is required' }),
	passportNumber: z.string({ required_error: 'Passport Number is required' }),
	passportExpiry: z.date({ required_error: 'Passport Expiry is required' }),
})

export function GeneralInfoEditor({
	participant,
	photo,
	intent,
}: {
	participant?: SerializeFrom<
		Pick<
			Participant,
			'id' | 'tenantId' | 'eventId' | 'participantTypeId' | 'countryId'
		>
	>
	photo?: SerializeFrom<
		Pick<
			ParticipantDocument,
			| 'id'
			| 'documentType'
			| 'fileName'
			| 'extension'
			| 'contentType'
			| 'altText'
		>
	>
	intent?: 'add' | 'edit' | 'delete'
}) {
	const { tenants, events, participantTypes, countries } = useOutletContext<{
		tenants: Tenant[]
		events: Event[]
		participantTypes: ParticipantType[]
		countries: Country[]
	}>()
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'register-participant',
		constraint: getZodConstraint(GeneralInfoEditorSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: GeneralInfoEditorSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...participant,
		},
	})

	const link = getParticipantDocumentFileSrc(photo?.id ?? '')

	return (
		<FormCard
			formId={form.id}
			onSubmit={form.onSubmit}
			buttons={[
				{
					label: 'Next',
					intent: 'general',
					variant: 'default',
					disabled: isPending,
					status: actionData?.result.status,
					type: 'submit',
				},
				{
					label: 'Cancel',
					to: '/admin/participants/cancel',
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />

			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<Field>
					<Label htmlFor={fields.title.id}>Title</Label>
					<SelectField
						meta={fields.title}
						items={['MR.', 'MRS.', 'MS.', 'DR.', 'PhD.', 'H.E.', 'H.M'].map(
							title => ({
								name: title,
								value: title,
							}),
						)}
						placeholder="Select Gender"
					/>
					{fields.title.errors && (
						<FieldError>{fields.title.errors}</FieldError>
					)}
				</Field>

				<Field>
					<Label htmlFor={fields.dateOfBirth.id}>Date of Birth</Label>
					<DatePickerField meta={fields.dateOfBirth} disabled={disabled} />
					{fields.dateOfBirth.errors && (
						<FieldError>{fields.dateOfBirth.errors}</FieldError>
					)}
				</Field>

				<Field>
					<Label htmlFor={fields.nationalityId.id}>Nationality</Label>
					<SelectField
						meta={fields.nationalityId}
						items={countries.map(country => ({
							name: country.name,
							value: country.id,
						}))}
						placeholder="Select Nationality"
					/>
					{fields.nationalityId.errors && (
						<FieldError>{fields.nationalityId.errors}</FieldError>
					)}
				</Field>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
					<DatePickerField meta={fields.passportExpiry} disabled={disabled} />
					{fields.passportExpiry.errors && (
						<FieldError>{fields.passportExpiry.errors}</FieldError>
					)}
				</Field>
				{/* {photo && <Photo link={link} altText={''} />} */}
			</div>
		</FormCard>
	)
}
