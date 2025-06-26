import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Tenant, Venue } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { xssTransform } from '~/utils/validations'
import { type action } from './__venue-editor.server'

export const VenueEditorSchema = z.object({
	id: z.string().optional(),
	name: z
		.string({ required_error: 'Name is required' })
		.transform(xssTransform),
	description: z
		.string({ required_error: 'Description is required' })
		.transform(xssTransform),
	contactInfo: z.string().optional().transform(xssTransform),
	address: z
		.string({ required_error: 'Address is required' })
		.transform(xssTransform),
	city: z
		.string({ required_error: 'City is required' })
		.transform(xssTransform),
	state: z
		.string({ required_error: 'State is required' })
		.transform(xssTransform),
	zip: z.string({ required_error: 'Zip is required' }).transform(xssTransform),
	country: z
		.string({ required_error: 'Country is required' })
		.transform(xssTransform),
	capacity: z
		.string({ required_error: 'Capacity is required' })
		.transform(xssTransform),
	latitude: z.string().optional().transform(xssTransform),
	longitude: z.string().optional().transform(xssTransform),
	amenities: z.string().optional().transform(xssTransform),
	tenantId: z.string({ required_error: 'Tenant is required' }),
})

export const VenueDeleteSchema = z.object({
	id: z.string(),
})

export function VenueEditor({
	tenant,
	venue,
	title,
	intent,
}: {
	tenant: SerializeFrom<Pick<Tenant, 'id' | 'name'>>
	venue?: SerializeFrom<Pick<Venue, 'id' | 'name' | 'description'>>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema = intent === 'delete' ? VenueDeleteSchema : VenueEditorSchema
	const [form, fields] = useForm({
		id: 'register-venue',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...venue,
			tenantId: tenant.id,
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this venue? This action cannot be undone.'
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
				},
				{
					label: 'Cancel',
					to: `/admin/tenants/${tenant.id}/venues`,
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />
			<InputField meta={fields.tenantId} type="hidden" />

			<Field>
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
			</Field>

			<Field>
				<Label htmlFor={fields.contactInfo.id}>Contact Info</Label>
				<InputField
					meta={fields.contactInfo}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.contactInfo.errors && (
					<FieldError>{fields.contactInfo.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.address.id}>Address</Label>
				<InputField
					meta={fields.address}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.address.errors && (
					<FieldError>{fields.address.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.city.id}>City</Label>
				<InputField
					meta={fields.city}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.city.errors && <FieldError>{fields.city.errors}</FieldError>}
			</Field>

			<Field>
				<Label htmlFor={fields.state.id}>State</Label>
				<InputField
					meta={fields.state}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.state.errors && <FieldError>{fields.state.errors}</FieldError>}
			</Field>

			<Field>
				<Label htmlFor={fields.zip.id}>Zip</Label>
				<InputField
					meta={fields.zip}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.zip.errors && <FieldError>{fields.zip.errors}</FieldError>}
			</Field>

			<Field>
				<Label htmlFor={fields.country.id}>Country</Label>
				<InputField
					meta={fields.country}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.country.errors && (
					<FieldError>{fields.country.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.capacity.id}>Capacity</Label>
				<InputField
					meta={fields.capacity}
					type="number"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.capacity.errors && (
					<FieldError>{fields.capacity.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.latitude.id}>Latitude</Label>
				<InputField
					meta={fields.latitude}
					type="number"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.latitude.errors && (
					<FieldError>{fields.latitude.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.longitude.id}>Longitude</Label>
				<InputField
					meta={fields.longitude}
					type="number"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.longitude.errors && (
					<FieldError>{fields.longitude.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.amenities.id}>Amenities</Label>
				<InputField
					meta={fields.amenities}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.amenities.errors && (
					<FieldError>{fields.amenities.errors}</FieldError>
				)}
			</Field>
		</FormCard>
	)
}
