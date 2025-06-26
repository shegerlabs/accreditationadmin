import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Event, Tenant } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData, useOutletContext } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import xss from 'xss'
import { z } from 'zod'
import { DatePickerField } from '~/components/conform/DatePickerField'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { xssTransform } from '~/utils/validations'
import { type action } from './__event-editor.server'

export const EventEditorSchema = z
	.object({
		id: z.string().optional(),
		name: z
			.string({ required_error: 'Name is required' })
			.trim()
			.min(1, 'Name cannot be empty')
			.max(255, 'Name is too long')
			.transform(xssTransform)
			.pipe(z.string()),
		startDate: z
			.date({ required_error: 'Start Date is required' })
			.refine(date => date >= new Date(), 'Start date must be in the future'),
		endDate: z
			.date({ required_error: 'End Date is required' })
			.refine(date => date >= new Date(), 'End date must be in the future'),
		description: z
			.string({ required_error: 'Description is required' })
			.min(1, 'Description cannot be empty')
			.max(255, 'Description is too long')
			.trim()
			.transform(val =>
				xss(val, {
					whiteList: {
						p: [],
						br: [],
						b: [],
						i: [],
					},
					stripIgnoreTag: true,
					stripIgnoreTagBody: ['script', 'style', 'iframe'],
				}),
			),
		tenantId: z
			.string({ required_error: 'Tenant is required' })
			.min(1, 'Tenant is required')
			.transform(val =>
				xss(val, {
					whiteList: {}, // no HTML tags allowed
					stripIgnoreTag: true,
				}),
			),
	})
	.refine(data => data.endDate >= data.startDate, {
		message: 'End date must be after start date',
		path: ['endDate'],
	})

export const EventDeleteSchema = z.object({
	id: z.string(),
})

export function EventEditor({
	event,
	title,
	intent,
}: {
	event?: SerializeFrom<
		Pick<
			Event,
			| 'id'
			| 'name'
			| 'description'
			| 'status'
			| 'tenantId'
			| 'startDate'
			| 'endDate'
		>
	>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const { tenants } = useOutletContext<{ tenants: Tenant[] }>()
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema = intent === 'delete' ? EventDeleteSchema : EventEditorSchema
	const [form, fields] = useForm({
		id: 'register-event',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...event,
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this event? This action cannot be undone.'
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
					to: `/admin/events`,
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />

			<Field>
				<Label htmlFor={fields.tenantId.id}>Tenant</Label>
				<SelectField
					meta={fields.tenantId}
					items={tenants.map(tenant => ({
						name: tenant.name,
						value: tenant.id,
					}))}
					disabled={disabled}
					placeholder="Select Tenant"
				/>
				{fields.tenantId.errors && (
					<FieldError>{fields.tenantId.errors}</FieldError>
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
			<div className="flex gap-4">
				<div className="flex-1">
					<Field>
						<Label htmlFor={fields.startDate.id}>Start Date</Label>
						<DatePickerField meta={fields.startDate} disabled={disabled} />
						{fields.startDate.errors && (
							<FieldError>{fields.startDate.errors}</FieldError>
						)}
					</Field>
				</div>

				<div className="flex-1">
					<Field>
						<Label htmlFor={fields.endDate.id}>End Date</Label>
						<DatePickerField meta={fields.endDate} disabled={disabled} />
						{fields.endDate.errors && (
							<FieldError>{fields.endDate.errors}</FieldError>
						)}
					</Field>
				</div>
			</div>
		</FormCard>
	)
}
