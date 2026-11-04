import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Constraint, ParticipantType, Restriction } from '@prisma/client'
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
import { type action } from './__constraint-editor.server'

export const ConstraintEditorSchema = z.object({
	id: z.string().optional(),
	name: z.string({ required_error: 'Name is required' }),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	participantTypeId: z.string({
		required_error: 'Participant Type is required',
	}),
	restrictionId: z.string({ required_error: 'Restriction is required' }),
	accessLevel: z.enum(['OPEN', 'CLOSED']),
	quota: z.string().optional(),
})

export const ConstraintDeleteSchema = z.object({
	id: z.string(),
	name: z.string(),
	tenantId: z.string(),
	participantTypeId: z.string(),
	restrictionId: z.string(),
	accessLevel: z.string(),
	quota: z.string().optional(),
})

export function ConstraintEditor({
	constraint,
	restriction,
	title,
	intent = 'add',
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
	const isPending = useIsPending()
	const navigate = useNavigate()
	const { eventId, restrictionId } = useParams()

	const isDelete = intent === 'delete'
	const schema = isDelete ? ConstraintDeleteSchema : ConstraintEditorSchema

	const [form, fields] = useForm({
		id: 'constraint-editor',
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
			quota: constraint?.quota?.toString() ?? '',
		},
	})

	const handleClose = () =>
		navigate(`/admin/events/${eventId}/restrictions/${restrictionId}/constraints`)

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent
				className="sm:max-w-[500px]"
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
						{...getInputProps(fields.tenantId, { type: 'hidden' })}
						key={fields.tenantId.key}
					/>
					<input
						{...getInputProps(fields.restrictionId, { type: 'hidden' })}
						key={fields.restrictionId.key}
					/>
					<input type="hidden" name="intent" value={intent} />

					{isDelete && (
						<>
							<input
								{...getInputProps(fields.name, { type: 'hidden' })}
								key={fields.name.key}
							/>
							<input
								{...getInputProps(fields.participantTypeId, { type: 'hidden' })}
								key={fields.participantTypeId.key}
							/>
							<input
								{...getInputProps(fields.accessLevel, { type: 'hidden' })}
								key={fields.accessLevel.key}
							/>
							<input
								{...getInputProps(fields.quota, { type: 'hidden' })}
								key={fields.quota.key}
							/>
						</>
					)}

					{!isDelete && (
						<div className="grid gap-4 py-4">
							<Field>
								<Label htmlFor={fields.name.id}>Name</Label>
								<Input
									{...getInputProps(fields.name, { type: 'text' })}
									key={fields.name.key}
									autoComplete="off"
								/>
								{fields.name.errors && (
									<FieldError>{fields.name.errors}</FieldError>
								)}
							</Field>

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

							<Field>
								<Label htmlFor={fields.quota.id}>Quota</Label>
								<Input
									{...getInputProps(fields.quota, { type: 'number' })}
									key={fields.quota.key}
								/>
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
