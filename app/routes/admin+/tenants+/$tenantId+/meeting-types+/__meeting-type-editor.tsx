import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { MeetingType, Tenant } from '@prisma/client'
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
import { type action } from './__meeting-type-editor.server'

export const MeetingTypeEditorSchema = z.object({
	id: z.string().optional(),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	name: z
		.string({ required_error: 'Name is required' })
		.transform(xssTransform),
	description: z
		.string({ required_error: 'Description is required' })
		.transform(xssTransform),
})

export const MeetingTypeDeleteSchema = z.object({
	id: z.string(),
})

export function MeetingTypeEditor({
	tenant,
	meetingType,
	title,
	intent,
}: {
	tenant: SerializeFrom<Pick<Tenant, 'id' | 'name'>>
	meetingType?: SerializeFrom<
		Pick<MeetingType, 'id' | 'name' | 'description' | 'tenantId'>
	>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema =
		intent === 'delete' ? MeetingTypeDeleteSchema : MeetingTypeEditorSchema
	const [form, fields] = useForm({
		id: 'register-meeting-type',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...meetingType,
			tenantId: tenant.id,
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this meeting type? This action cannot be undone.'
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
					to: `/admin/tenants/${tenant.id}/meeting-types`,
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
		</FormCard>
	)
}
