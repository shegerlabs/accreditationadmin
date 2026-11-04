import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Constraint, Event, Restriction } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { Form, useActionData, useNavigate } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
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
	tenantId: z.string(),
	eventId: z.string(),
	name: z.string(),
})

export function RestrictionEditor({
	event,
	restriction,
	title,
	intent = 'add',
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
	const isPending = useIsPending()
	const navigate = useNavigate()

	const isDelete = intent === 'delete'
	const schema = isDelete ? RestrictionDeleteSchema : RestrictionEditorSchema

	const [form, fields] = useForm({
		id: 'restriction-editor',
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

	const handleClose = () => navigate(`/admin/events/${event.id}/restrictions`)

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent
				className="sm:max-w-[450px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{isDelete
							? 'Are you sure you want to delete this restriction? This action cannot be undone.'
							: intent === 'edit'
								? 'Update the restriction details below.'
								: 'Fill in the details to create a new restriction.'}
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
						{...getInputProps(fields.eventId, { type: 'hidden' })}
						key={fields.eventId.key}
					/>
					<input
						{...getInputProps(fields.tenantId, { type: 'hidden' })}
						key={fields.tenantId.key}
					/>
					<input type="hidden" name="intent" value={intent} />

					{isDelete && (
						<input
							{...getInputProps(fields.name, { type: 'hidden' })}
							key={fields.name.key}
						/>
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
						</div>
					)}

					{isDelete && (
						<div className="py-4">
							<p className="text-sm text-muted-foreground">
								This will permanently delete this restriction and all its
								constraints. This action cannot be undone.
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
