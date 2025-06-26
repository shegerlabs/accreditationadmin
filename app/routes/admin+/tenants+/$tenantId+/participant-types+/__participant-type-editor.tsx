import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { ParticipantType, Tenant } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxField } from '~/components/conform/CheckboxField'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { xssTransform } from '~/utils/validations'
import { type action } from './__participant-type-editor.server'

export const ParticipantTypeEditorSchema = z.object({
	id: z.string().optional(),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	name: z
		.string({ required_error: 'Name is required' })
		.transform(xssTransform),
	description: z
		.string({ required_error: 'Description is required' })
		.transform(xssTransform),
	priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
	canSendPrivateRequest: z.boolean().optional(),
	canSendAnonymousRequest: z.boolean().optional(),
	isExemptedFromFullQuota: z.boolean().optional(),
	isExemptedFromOpenSessionQuota: z.boolean().optional(),
	isExemptedFromClosedSessionQuota: z.boolean().optional(),
})

export const ParticipantTypeDeleteSchema = z.object({
	id: z.string(),
})

export function ParticipantTypeEditor({
	tenant,
	participantType,
	title,
	intent,
}: {
	tenant: SerializeFrom<Pick<Tenant, 'id' | 'name'>>
	participantType?: SerializeFrom<
		Pick<ParticipantType, 'id' | 'name' | 'description'>
	>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	console.log('xxx', tenant)
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema =
		intent === 'delete'
			? ParticipantTypeDeleteSchema
			: ParticipantTypeEditorSchema
	const [form, fields] = useForm({
		id: 'register-participant-type',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...participantType,
			tenantId: tenant.id,
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this participant type? This action cannot be undone.'
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
					to: `/admin/tenants/${tenant.id}/participant-types`,
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
				<Label htmlFor={fields.priority.id}>Priority</Label>
				<SelectField
					meta={fields.priority}
					items={[
						{ name: 'High', value: 'HIGH' },
						{ name: 'Medium', value: 'MEDIUM' },
						{ name: 'Low', value: 'LOW' },
					]}
					disabled={disabled}
					placeholder="Priority"
				/>
				{fields.priority.errors && (
					<FieldError>{fields.priority.errors}</FieldError>
				)}
			</Field>

			<Field>
				<div className="flex items-center gap-2">
					<CheckboxField
						meta={fields.canSendPrivateRequest}
						disabled={disabled}
					/>
					<Label htmlFor={fields.canSendPrivateRequest.id}>
						Can Send Private Request
					</Label>
				</div>
				{fields.canSendPrivateRequest.errors && (
					<FieldError>{fields.canSendPrivateRequest.errors}</FieldError>
				)}
			</Field>
			<Field>
				<div className="flex items-center gap-2">
					<CheckboxField
						meta={fields.canSendAnonymousRequest}
						disabled={disabled}
					/>
					<Label htmlFor={fields.canSendAnonymousRequest.id}>
						Can Send Anonymous Request
					</Label>
				</div>
			</Field>
			<Field>
				<div className="flex items-center gap-2">
					<CheckboxField
						meta={fields.isExemptedFromFullQuota}
						disabled={disabled}
					/>
					<Label htmlFor={fields.isExemptedFromFullQuota.id}>
						Is Exempted From Full Quota
					</Label>
				</div>
			</Field>
			<Field>
				<div className="flex items-center gap-2">
					<CheckboxField
						meta={fields.isExemptedFromOpenSessionQuota}
						disabled={disabled}
					/>
					<Label htmlFor={fields.isExemptedFromOpenSessionQuota.id}>
						Is Exempted From Open Session Quota
					</Label>
				</div>
			</Field>
			<Field>
				<div className="flex items-center gap-2">
					<CheckboxField
						meta={fields.isExemptedFromClosedSessionQuota}
						disabled={disabled}
					/>
					<Label htmlFor={fields.isExemptedFromClosedSessionQuota.id}>
						Is Exempted From Closed Session Quota
					</Label>
				</div>
			</Field>
		</FormCard>
	)
}
