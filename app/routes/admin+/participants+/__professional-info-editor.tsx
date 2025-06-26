import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Country, Participant } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData, useOutletContext } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { useIsPending } from '~/utils/misc'
import { type action } from './__participant-editor.server'

export const ProfessionalInfoEditorSchema = z.object({
	id: z.string().optional(),
	organization: z.string({ required_error: 'Organization is required' }),
	jobTitle: z.string({ required_error: 'Job Title is required' }),
	countryId: z.string({ required_error: 'Country is required' }),
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
})

export function ProfessionalInfoEditor({
	participant,
	intent,
}: {
	participant?: SerializeFrom<
		Pick<Participant, 'id' | 'tenantId' | 'eventId' | 'participantTypeId'>
	>
	intent?: 'add' | 'edit' | 'delete'
}) {
	const { countries } = useOutletContext<{ countries: Country[] }>()
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema = ProfessionalInfoEditorSchema
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'register-professional-info',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...participant,
		},
	})

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
				{
					label: 'Next',
					intent: 'professional',
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
			encType="multipart/form-data"
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />

			<div className="grid grid-cols-3 gap-4">
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
					<Label htmlFor={fields.countryId.id}>Country</Label>
					<SelectField
						meta={fields.countryId}
						items={countries.map(country => ({
							name: country.name,
							value: country.id,
						}))}
						placeholder="Select Your Country"
					/>
					{fields.countryId.errors && (
						<FieldError>{fields.countryId.errors}</FieldError>
					)}
				</Field>
			</div>

			<div className="grid grid-cols-3 gap-4">
				<Field>
					<Label htmlFor={fields.city.id}>City</Label>
					<InputField meta={fields.city} type="text" disabled={disabled} />
					{fields.city.errors && <FieldError>{fields.city.errors} </FieldError>}
				</Field>

				<Field>
					<Label htmlFor={fields.email.id}>Email</Label>
					<InputField meta={fields.email} type="email" disabled={disabled} />
					{fields.email.errors && (
						<FieldError>{fields.email.errors}</FieldError>
					)}
				</Field>

				<Field>
					<Label htmlFor={fields.website.id}>Website</Label>
					<InputField meta={fields.website} type="text" disabled={disabled} />
					{fields.website.errors && (
						<FieldError>{fields.website.errors}</FieldError>
					)}
				</Field>
			</div>

			<div className="grid grid-cols-3 gap-4">
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
					<Label htmlFor={fields.preferredLanguage.id}>
						Preferred Language
					</Label>
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
			</div>
		</FormCard>
	)
}
