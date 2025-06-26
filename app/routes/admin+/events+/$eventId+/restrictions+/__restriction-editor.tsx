import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Constraint, Event, Restriction } from '@prisma/client'
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
import { type action } from './__restriction-editor.server'

export const RestrictionEditorSchema = z.object({
	id: z.string().optional(),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	eventId: z.string({ required_error: 'Event is required' }),
	name: z
		.string({ required_error: 'Name is required' })
		.transform(xssTransform),
})

export const RestrictionDeleteSchema = z.object({
	id: z.string(),
})

export function RestrictionEditor({
	event,
	restriction,
	title,
	intent,
}: {
	event: SerializeFrom<Pick<Event, 'id' | 'name' | 'tenantId'>>
	restriction?: SerializeFrom<
		Pick<Restriction, 'id' | 'tenantId' | 'eventId' | 'name'> & {
			constraints: SerializeFrom<Constraint[]>
		}
	>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema =
		intent === 'delete' ? RestrictionDeleteSchema : RestrictionEditorSchema
	const [form, fields] = useForm({
		id: 'register-restriction',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...restriction,
			eventId: event.id,
			tenantId: event.tenantId,
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this restriction? This action cannot be undone.'
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
					to: `/admin/events/${event.id}/restrictions`,
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
