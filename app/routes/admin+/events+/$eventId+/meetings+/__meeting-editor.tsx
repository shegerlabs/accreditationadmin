import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Event, Meeting, MeetingType, Venue } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { Form, useActionData, useNavigate, useOutletContext } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { DatePickerField } from '~/components/conform/DatePickerField'
import { SelectField } from '~/components/conform/SelectField'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { useIsPending } from '~/utils/misc'
import { type action } from './__meeting-editor.server'

export const MeetingEditorSchema = z.object({
	id: z.string().optional(),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	eventId: z.string({ required_error: 'Event is required' }),
	meetingTypeId: z.string({ required_error: 'Meeting Type is required' }),
	venueId: z.string({ required_error: 'Venue is required' }),
	accessLevel: z.enum(['OPEN', 'CLOSED']),
	startDate: z.date({ required_error: 'Start Date is required' }),
	endDate: z.date({ required_error: 'End Date is required' }),
})

export const MeetingDeleteSchema = z.object({
	id: z.string(),
	tenantId: z.string(),
	eventId: z.string(),
	meetingTypeId: z.string(),
	venueId: z.string(),
	accessLevel: z.string(),
	startDate: z.date(),
	endDate: z.date(),
})

export function MeetingEditor({
	event,
	meeting,
	title,
	intent = 'add',
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
		meetingTypes: MeetingType[]
		venues: Venue[]
	}>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const navigate = useNavigate()

	const isDelete = intent === 'delete'
	const schema = isDelete ? MeetingDeleteSchema : MeetingEditorSchema

	const [form, fields] = useForm({
		id: 'meeting-editor',
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

	const handleClose = () => navigate(`/admin/events/${event.id}/meetings`)

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent
				className="sm:max-w-[550px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{isDelete
							? 'Are you sure you want to delete this meeting? This action cannot be undone.'
							: intent === 'edit'
								? 'Update the meeting details below.'
								: 'Fill in the details to create a new meeting.'}
					</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<input
						{...getInputProps(fields.id, { type: 'hidden' })}
						key={fields.id.key}
					/>
					<input
						{...getInputProps(fields.tenantId, { type: 'hidden' })}
						key={fields.tenantId.key}
					/>
					<input
						{...getInputProps(fields.eventId, { type: 'hidden' })}
						key={fields.eventId.key}
					/>
					<input type="hidden" name="intent" value={intent} />

					{isDelete && (
						<>
							<input
								{...getInputProps(fields.meetingTypeId, { type: 'hidden' })}
								key={fields.meetingTypeId.key}
							/>
							<input
								{...getInputProps(fields.venueId, { type: 'hidden' })}
								key={fields.venueId.key}
							/>
							<input
								{...getInputProps(fields.accessLevel, { type: 'hidden' })}
								key={fields.accessLevel.key}
							/>
							<Input
								{...getInputProps(fields.startDate, { type: 'hidden' })}
								key={fields.startDate.key}
							/>
							<Input
								{...getInputProps(fields.endDate, { type: 'hidden' })}
								key={fields.endDate.key}
							/>
						</>
					)}

					{!isDelete && (
						<div className="grid gap-4 py-4">
							<Field>
								<Label htmlFor={fields.meetingTypeId.id}>Meeting Type</Label>
								<SelectField
									meta={fields.meetingTypeId}
									items={meetingTypes.map(meetingType => ({
										name: meetingType.name,
										value: meetingType.id,
									}))}
									placeholder="Select Meeting Type"
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
									items={['OPEN', 'CLOSED'].map(accessLevel => ({
										name: accessLevel,
										value: accessLevel,
									}))}
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
										<DatePickerField meta={fields.startDate} />
									</Field>
									{fields.startDate.errors && (
										<FieldError>{fields.startDate.errors}</FieldError>
									)}
								</div>

								<div className="flex-1">
									<Field>
										<Label htmlFor={fields.endDate.id}>End Date</Label>
										<DatePickerField meta={fields.endDate} />
									</Field>
									{fields.endDate.errors && (
										<FieldError>{fields.endDate.errors}</FieldError>
									)}
								</div>
							</div>

							<ErrorList errors={form.errors} id={form.errorId} />
						</div>
					)}

					{isDelete && (
						<div className="py-4">
							<p className="text-sm text-muted-foreground">
								This will permanently delete this meeting. This action cannot be
								undone.
							</p>
						</div>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={handleClose}>
							Cancel
						</Button>
						<Button
							type="submit"
							variant={isDelete ? 'destructive' : 'default'}
							disabled={isPending}
						>
							{isPending
								? isDelete
									? 'Deleting...'
									: 'Saving...'
								: isDelete
									? 'Delete'
									: 'Save'}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
