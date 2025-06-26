import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Constraint, ParticipantType, Restriction } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData, useOutletContext, useParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { xssTransform } from '~/utils/validations'
import { type action } from './__constraint-editor.server'

export const ConstraintEditorSchema = z.object({
	id: z.string().optional(),
	name: z.string({ required_error: 'Name is required' }),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	participantTypeId: z.string({
		required_error: 'Participant Type is required',
	}),
	restrictionId: z.string({ required_error: 'Restriction is required' }),
	accessLevel: z.enum(['FREE', 'OPEN', 'CLOSED']),
	quota: z.string().optional().transform(xssTransform),
})

export const ConstraintDeleteSchema = z.object({
	id: z.string(),
})

export function ConstraintEditor({
	constraint,
	restriction,
	title,
	intent,
}: {
	constraint?: SerializeFrom<
		Pick<
			Constraint,
			| 'id'
			| 'name'
			| 'tenantId'
			| 'participantTypeId'
			| 'restrictionId'
			| 'accessLevel'
			| 'quota'
		>
	>
	restriction: SerializeFrom<Pick<Restriction, 'id' | 'tenantId' | 'eventId'>>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const { participantTypes } = useOutletContext<{
		participantTypes: ParticipantType[]
	}>()
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema =
		intent === 'delete' ? ConstraintDeleteSchema : ConstraintEditorSchema
	const [form, fields] = useForm({
		id: 'register-constraint',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...constraint,
			tenantId: restriction.tenantId,
			restrictionId: restriction.id,
			participantTypeId: constraint?.participantTypeId,
		},
	})

	const { eventId, restrictionId } = useParams()

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this constraint? This action cannot be undone.'
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
					to: `/admin/events/${eventId}/restrictions/${restrictionId}/constraints`,
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />
			<InputField meta={fields.tenantId} type="hidden" />
			<InputField meta={fields.restrictionId} type="hidden" />

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
				<Label htmlFor={fields.participantTypeId.id}>Participant Type</Label>
				<SelectField
					meta={fields.participantTypeId}
					items={participantTypes.map(participantType => ({
						name: participantType.name,
						value: participantType.id,
					}))}
					disabled={disabled}
					placeholder="Select Participant Type"
				/>
			</Field>

			<Field>
				<Label htmlFor={fields.accessLevel.id}>Access Level</Label>
				<SelectField
					meta={fields.accessLevel}
					items={['FREE', 'OPEN', 'CLOSED'].map(accessLevel => ({
						name: accessLevel,
						value: accessLevel,
					}))}
					disabled={disabled}
					placeholder="Select Access Level"
				/>
			</Field>

			<Field>
				<Label htmlFor={fields.quota.id}>Quota</Label>
				<InputField meta={fields.quota} type="number" disabled={disabled} />
				{fields.quota.errors && <FieldError>{fields.quota.errors}</FieldError>}
			</Field>
		</FormCard>
	)
}
