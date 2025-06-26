import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Event, Meeting, MeetingType, Tenant, Venue } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData, useOutletContext } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { DatePickerField } from '~/components/conform/DatePickerField'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { FormCard } from '~/components/form-card'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { type action } from './__meeting-editor.server'

export const MeetingEditorSchema = z.object({
	id: z.string().optional(),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	eventId: z.string({ required_error: 'Event is required' }),
	meetingTypeId: z.string({ required_error: 'Meeting Type is required' }),
	venueId: z.string({ required_error: 'Venue is required' }),
	accessLevel: z.enum(['FREE', 'OPEN', 'CLOSED', 'ALL']),
	startDate: z.date({ required_error: 'Start Date is required' }),
	endDate: z.date({ required_error: 'End Date is required' }),
})

export const MeetingDeleteSchema = z.object({
	id: z.string(),
})

export function MeetingEditor({
	event,
	meeting,
	title,
	intent,
}: {
	event: SerializeFrom<Pick<Event, 'id' | 'name' | 'tenantId'>>
	meeting?: SerializeFrom<
		Pick<
			Meeting,
			| 'id'
			| 'eventId'
			| 'meetingTypeId'
			| 'venueId'
			| 'accessLevel'
			| 'startDate'
			| 'endDate'
		>
	>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const { meetingTypes, venues } = useOutletContext<{
		tenants: Tenant[]
		events: Event[]
		meetingTypes: MeetingType[]
		venues: Venue[]
	}>()
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema = intent === 'delete' ? MeetingDeleteSchema : MeetingEditorSchema
	const [form, fields] = useForm({
		id: 'register-meeting',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...meeting,
			tenantId: event.tenantId,
			eventId: event.id,
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this meeting? This action cannot be undone.'
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
					to: `/admin/events/${event.id}/meetings`,
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />
			<InputField meta={fields.tenantId} type="hidden" />
			<InputField meta={fields.eventId} type="hidden" />

			<Field>
				<Label htmlFor={fields.meetingTypeId.id}>Meeting Type</Label>
				<SelectField
					meta={fields.meetingTypeId}
					items={meetingTypes.map(meetingType => ({
						name: meetingType.name,
						value: meetingType.id,
					}))}
					placeholder="Select Meeting Type"
					disabled={disabled}
				/>
				{fields.meetingTypeId.errors && (
					<FieldError>{fields.meetingTypeId.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.venueId.id}>Venue</Label>
				<SelectField
					meta={fields.venueId}
					items={venues.map(venue => ({
						name: venue.name,
						value: venue.id,
					}))}
					disabled={disabled}
					placeholder="Select Venue"
				/>
				{fields.venueId.errors && (
					<FieldError>{fields.venueId.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.accessLevel.id}>Access Level</Label>
				<SelectField
					meta={fields.accessLevel}
					items={['FREE', 'OPEN', 'CLOSED', 'ALL'].map(accessLevel => ({
						name: accessLevel,
						value: accessLevel,
					}))}
					disabled={disabled}
					placeholder="Select Access Level"
				/>
				{fields.accessLevel.errors && (
					<FieldError>{fields.accessLevel.errors}</FieldError>
				)}
			</Field>

			<div className="flex gap-4">
				<div className="flex-1">
					<Field>
						<Label htmlFor={fields.startDate.id}>Start Date</Label>
						<DatePickerField meta={fields.startDate} disabled={disabled} />
					</Field>
					{fields.startDate.errors && (
						<FieldError>{fields.startDate.errors}</FieldError>
					)}
				</div>

				<div className="flex-1">
					<Field>
						<Label htmlFor={fields.endDate.id}>End Date</Label>
						<DatePickerField meta={fields.endDate} disabled={disabled} />
					</Field>
					{fields.endDate.errors && (
						<FieldError>{fields.endDate.errors}</FieldError>
					)}
				</div>
			</div>
			<ErrorList errors={form.errors} id={form.errorId} />
		</FormCard>
	)
}
