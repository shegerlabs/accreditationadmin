import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Event, ParticipantType, Tenant, Workflow } from '@prisma/client'
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
import { type action } from './__workflow-editor.server'

export const WorkflowEditorSchema = z.object({
	id: z.string().optional(),
	name: z
		.string({ required_error: 'Name is required' })
		.transform(xssTransform),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	eventId: z.string({ required_error: 'Event is required' }),
	participantTypeId: z.string({
		required_error: 'Participant Type is required',
	}),
})

export const WorkflowDeleteSchema = z.object({
	id: z.string(),
})

export function WorkflowEditor({
	event,
	workflow,
	title,
	intent,
}: {
	event: SerializeFrom<Pick<Event, 'id' | 'name' | 'tenantId'>>
	workflow?: SerializeFrom<
		Pick<Workflow, 'id' | 'name' | 'tenantId' | 'eventId' | 'participantTypeId'>
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
		intent === 'delete' ? WorkflowDeleteSchema : WorkflowEditorSchema
	const [form, fields] = useForm({
		id: 'register-workflow',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...workflow,
			eventId: event.id,
			tenantId: event.tenantId,
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this workflow? This action cannot be undone.'
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
					to: `/admin/events/${event.id}/workflows`,
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
				{fields.participantTypeId.errors && (
					<FieldError>{fields.participantTypeId.errors}</FieldError>
				)}
			</Field>

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
		</FormCard>
	)
}
