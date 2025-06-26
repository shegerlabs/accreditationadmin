import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Event, Invitation, ParticipantType, Restriction } from '@prisma/client'
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
import { xssTransform } from '~/utils/validations'
import { type action } from './__invitation-editor.server'

export const InvitationEditorSchema = z.object({
	id: z.string().optional(),
	organization: z
		.string({ required_error: 'Organization is required' })
		.transform(xssTransform),
	email: z
		.string({ required_error: 'Email is required' })
		.transform(xssTransform),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	eventId: z.string({ required_error: 'Event is required' }),
	participantTypeId: z.string({
		required_error: 'Participant Type is required',
	}),
	restrictionId: z.string({ required_error: 'Restriction is required' }),
	maximumQuota: z.string().optional().transform(xssTransform),
})

export const InvitationDeleteSchema = z.object({
	id: z.string(),
})

export function InvitationEditor({
	event,
	invitation,
	title,
	intent,
}: {
	event: SerializeFrom<Pick<Event, 'id' | 'name' | 'tenantId'>>
	invitation?: SerializeFrom<
		Pick<
			Invitation,
			| 'id'
			| 'organization'
			| 'email'
			| 'tenantId'
			| 'eventId'
			| 'participantTypeId'
			| 'restrictionId'
			| 'maximumQuota'
		>
	>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const { restrictions, participantTypes } = useOutletContext<{
		restrictions: Restriction[]
		participantTypes: ParticipantType[]
	}>()
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema =
		intent === 'delete' ? InvitationDeleteSchema : InvitationEditorSchema
	const [form, fields] = useForm({
		id: 'register-invitation',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...invitation,
			eventId: event.id,
			tenantId: event.tenantId,
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this invitation? This action cannot be undone.'
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
					to: `/admin/events/${event.id}/invitations`,
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />
			<InputField meta={fields.eventId} type="hidden" />
			<InputField meta={fields.tenantId} type="hidden" />

			<Field>
				<Label htmlFor={fields.organization.id}>Organization</Label>
				<InputField
					meta={fields.organization}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.organization.errors && (
					<FieldError>{fields.organization.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.email.id}>Email</Label>
				<InputField
					meta={fields.email}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.email.errors && <FieldError>{fields.email.errors}</FieldError>}
			</Field>

			<Field>
				<Label htmlFor={fields.restrictionId.id}>Restriction</Label>
				<SelectField
					meta={fields.restrictionId}
					items={restrictions.map(restriction => ({
						name: restriction.name,
						value: restriction.id,
					}))}
					placeholder="Select Restriction"
				/>
				{fields.restrictionId.errors && (
					<FieldError>{fields.restrictionId.errors}</FieldError>
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
				<Label htmlFor={fields.maximumQuota.id}>Maximum Quota</Label>
				<InputField meta={fields.maximumQuota} type="number" />
				{fields.maximumQuota.errors && (
					<FieldError>{fields.maximumQuota.errors}</FieldError>
				)}
			</Field>
		</FormCard>
	)
}
