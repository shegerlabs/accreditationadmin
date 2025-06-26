import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Permission } from '@prisma/client'
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
import { type action } from './__permission-editor.server'

export const PermissionEditorSchema = z.object({
	id: z.string().optional(),
	entity: z
		.string({ required_error: 'Entity is required' })
		.transform(xssTransform)
		.pipe(z.string()),
	action: z
		.string({ required_error: 'Action is required' })
		.transform(xssTransform)
		.pipe(z.string()),
	access: z
		.string({ required_error: 'Access is required' })
		.transform(xssTransform)
		.pipe(z.string()),
	description: z.string().optional().transform(xssTransform).pipe(z.string()),
})

export const PermissionDeleteSchema = z.object({
	id: z.string(),
})

export function PermissionEditor({
	permission,
	title,
	intent,
}: {
	permission?: SerializeFrom<
		Pick<Permission, 'id' | 'entity' | 'action' | 'access' | 'description'>
	>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema =
		intent === 'delete' ? PermissionDeleteSchema : PermissionEditorSchema
	const [form, fields] = useForm({
		id: 'register-permission',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...permission,
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this permission? This action cannot be undone.'
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
					to: '/admin/permissions',
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />

			<div className="space-y-4">
				<Field>
					<Label htmlFor={fields.entity.id}>Entity</Label>
					<InputField
						meta={fields.entity}
						type="text"
						autoComplete="off"
						disabled={disabled}
						className="w-full"
					/>
					{fields.entity.errors && (
						<FieldError>{fields.entity.errors}</FieldError>
					)}
				</Field>

				<Field>
					<Label htmlFor={fields.action.id}>Action</Label>
					<InputField
						meta={fields.action}
						type="text"
						autoComplete="off"
						disabled={disabled}
						className="w-full"
					/>
					{fields.action.errors && (
						<FieldError>{fields.action.errors}</FieldError>
					)}
				</Field>
			</div>

			<div className="space-y-4">
				<Field>
					<Label htmlFor={fields.access.id}>Access</Label>
					<InputField
						meta={fields.access}
						type="text"
						autoComplete="off"
						disabled={disabled}
						className="w-full"
					/>
					{fields.access.errors && (
						<FieldError>{fields.access.errors}</FieldError>
					)}
				</Field>
			</div>
		</FormCard>
	)
}
