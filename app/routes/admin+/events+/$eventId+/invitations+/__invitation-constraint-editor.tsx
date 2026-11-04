import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { AccessLevel, Invitation, ParticipantType } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { Form, useActionData, useNavigate, useOutletContext, useParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { SelectField } from '~/components/conform/SelectField'
import { Field, FieldError } from '~/components/forms'
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
import { type action } from './__invitation-constraint-editor.server'

export const InvitationConstraintEditorSchema = z.object({
	id: z.string().optional(),
	invitationId: z.string({ required_error: 'Invitation is required' }),
	participantTypeId: z.string({
		required_error: 'Participant Type is required',
	}),
	accessLevel: z.nativeEnum(AccessLevel),
	quota: z
		.string()
		.optional()
		.transform(val => (val ? parseInt(val, 10) : null)),
	sourceRestrictionId: z.string().optional().nullable(),
})

export const InvitationConstraintDeleteSchema = z.object({
	id: z.string(),
})

type InvitationConstraintData = {
	id: string
	invitationId: string
	participantTypeId: string
	accessLevel: AccessLevel
	quota: number | null
	sourceRestrictionId?: string | null
}

export function InvitationConstraintEditor({
	constraint,
	invitation,
	title,
	intent = 'add',
}: {
	constraint?: SerializeFrom<InvitationConstraintData>
	invitation: SerializeFrom<Pick<Invitation, 'id' | 'organization' | 'eventId'>>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const { participantTypes, accessLevels } = useOutletContext<{
		participantTypes: ParticipantType[]
		accessLevels: AccessLevel[]
	}>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const navigate = useNavigate()
	const { eventId, invitationId } = useParams()

	const isDelete = intent === 'delete'
	const schema = isDelete
		? InvitationConstraintDeleteSchema
		: InvitationConstraintEditorSchema

	const [form, fields] = useForm({
		id: 'invitation-constraint-editor',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...constraint,
			invitationId: invitation.id,
			quota: constraint?.quota?.toString() ?? '',
		},
	})

	const handleClose = () =>
		navigate(`/admin/events/${eventId}/invitations/${invitationId}/constraints`)

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent
				className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{isDelete
							? 'Are you sure you want to delete this constraint? This action cannot be undone.'
							: intent === 'edit'
								? 'Update the constraint details below.'
								: 'Fill in the details to create a new constraint.'}
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
						{...getInputProps(fields.invitationId, { type: 'hidden' })}
						key={fields.invitationId.key}
					/>
					<input type="hidden" name="intent" value={intent} />

					{!isDelete && (
						<div className="grid gap-4 py-4">
							<Field>
								<Label htmlFor={fields.participantTypeId.id}>
									Participant Type
								</Label>
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
								<Label htmlFor={fields.accessLevel.id}>Access Level</Label>
								<SelectField
									meta={fields.accessLevel}
									items={accessLevels.map(level => ({
										name: level,
										value: level,
									}))}
									placeholder="Select Access Level"
								/>
								{fields.accessLevel.errors && (
									<FieldError>{fields.accessLevel.errors}</FieldError>
								)}
							</Field>

							<Field>
								<Label htmlFor={fields.quota.id}>Quota</Label>
								<Input
									{...getInputProps(fields.quota, { type: 'number' })}
									key={fields.quota.key}
									placeholder="Leave empty for unlimited"
								/>
								<p className="text-xs text-muted-foreground">
									Maximum number of participants for this type. Leave empty for
									unlimited.
								</p>
								{fields.quota.errors && (
									<FieldError>{fields.quota.errors}</FieldError>
								)}
							</Field>
						</div>
					)}

					{isDelete && (
						<div className="py-4">
							<p className="text-sm text-muted-foreground">
								This will permanently delete this constraint. This action cannot
								be undone.
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
