import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Tenant } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { EmailSchema, xssTransform } from '~/utils/validations'
import { type action } from './__tenant-editor.server'

export const TenantEditorSchema = z.object({
	id: z.string().optional(),
	name: z
		.string({ required_error: 'Name is required' })
		.trim()
		.min(1, 'Name cannot be empty')
		.max(255, 'Name cannot be longer than 255 characters')
		.transform(xssTransform)
		.pipe(z.string()),
	email: EmailSchema,
	phone: z
		.string({ required_error: 'Phone is required' })
		.trim()
		.min(1, 'Phone cannot be empty')
		.max(255, 'Phone cannot be longer than 255 characters')
		.transform(xssTransform)
		.pipe(z.string()),
	website: z.string().optional().transform(xssTransform),
	address: z.string().optional().transform(xssTransform),
	city: z.string().optional().transform(xssTransform),
	state: z.string().optional().transform(xssTransform),
	zip: z.string().optional().transform(xssTransform),
	country: z.string().optional().transform(xssTransform),
	subscriptionPlan: z
		.string({ required_error: 'Subscription Plan is required' })
		.transform(xssTransform)
		.pipe(z.string()),
})

export const TenantDeleteSchema = z.object({
	id: z.string(),
})

export function TenantEditor({
	tenant,
	title,
	intent,
}: {
	tenant?: SerializeFrom<
		Pick<
			Tenant,
			| 'id'
			| 'name'
			| 'email'
			| 'phone'
			| 'website'
			| 'address'
			| 'city'
			| 'state'
			| 'zip'
			| 'country'
			| 'subscriptionPlan'
		>
	>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema = intent === 'delete' ? TenantDeleteSchema : TenantEditorSchema
	const [form, fields] = useForm({
		id: 'register-tenant',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...tenant,
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this tenant? This action cannot be undone.'
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
					to: `/admin/tenants`,
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />

			<Field>
				<Label htmlFor={fields.name.id}>Name</Label>
				<InputField
					meta={fields.name}
					type="text"
					autoComplete="off"
					disabled={disabled}
					className="w-full"
				/>
				{fields.name.errors && <FieldError>{fields.name.errors}</FieldError>}
			</Field>

			<Field>
				<Label htmlFor={fields.email.id}>Email</Label>
				<InputField
					meta={fields.email}
					type="email"
					autoComplete="off"
					disabled={disabled}
					className="w-full"
				/>
				{fields.email.errors && <FieldError>{fields.email.errors}</FieldError>}
			</Field>

			<Field>
				<Label htmlFor={fields.phone.id}>Phone</Label>
				<InputField
					meta={fields.phone}
					type="text"
					autoComplete="off"
					disabled={disabled}
					className="w-full"
				/>
				{fields.phone.errors && <FieldError>{fields.phone.errors}</FieldError>}
			</Field>

			<Field>
				<Label htmlFor={fields.website.id}>Website</Label>
				<InputField
					meta={fields.website}
					type="text"
					autoComplete="off"
					disabled={disabled}
					className="w-full"
				/>
				{fields.website.errors && (
					<FieldError>{fields.website.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.address.id}>Address</Label>
				<InputField
					meta={fields.address}
					type="text"
					autoComplete="off"
					disabled={disabled}
					className="w-full"
				/>
				{fields.address.errors && (
					<FieldError>{fields.address.errors}</FieldError>
				)}
			</Field>

			<div className="flex gap-4">
				<div className="flex-1">
					<Field>
						<Label htmlFor={fields.city.id}>City</Label>
						<InputField
							meta={fields.city}
							type="text"
							autoComplete="off"
							disabled={disabled}
							className="w-full"
						/>
						{fields.city.errors && (
							<FieldError>{fields.city.errors}</FieldError>
						)}
					</Field>
				</div>

				<div className="flex-1">
					<Field>
						<Label htmlFor={fields.state.id}>State</Label>
						<InputField
							meta={fields.state}
							type="text"
							autoComplete="off"
							disabled={disabled}
							className="w-full"
						/>
						{fields.state.errors && (
							<FieldError>{fields.state.errors}</FieldError>
						)}
					</Field>
				</div>
			</div>

			<div className="flex gap-4">
				<div className="flex-1">
					<Field>
						<Label htmlFor={fields.zip.id}>Zip</Label>
						<InputField
							meta={fields.zip}
							type="text"
							autoComplete="off"
							disabled={disabled}
							className="w-full"
						/>
						{fields.zip.errors && <FieldError>{fields.zip.errors}</FieldError>}
					</Field>
				</div>

				<div className="flex-1">
					<Field>
						<Label htmlFor={fields.country.id}>Country</Label>
						<InputField
							meta={fields.country}
							type="text"
							autoComplete="off"
							disabled={disabled}
							className="w-full"
						/>
						{fields.country.errors && (
							<FieldError>{fields.country.errors}</FieldError>
						)}
					</Field>
				</div>
			</div>

			<Field>
				<Label htmlFor={fields.subscriptionPlan.id}>Subscription Plan</Label>
				<InputField
					meta={fields.subscriptionPlan}
					type="text"
					autoComplete="off"
					disabled={disabled}
					className="w-full"
				/>

				{fields.subscriptionPlan.errors && (
					<FieldError>{fields.subscriptionPlan.errors}</FieldError>
				)}
			</Field>
		</FormCard>
	)
}
