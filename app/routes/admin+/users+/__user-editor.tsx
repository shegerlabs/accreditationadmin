import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Role, User } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxGroupField } from '~/components/conform/CheckboxGroupField'
import { InputField } from '~/components/conform/InputField'
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import {
	EmailSchema,
	NameSchema,
	PasswordSchema,
	UsernameSchema,
	xssTransform,
} from '~/utils/validations'
import { type action } from './__user-editor.server'

export const UserEditorSchema = z
	.object({
		id: z.string().optional(),
		name: NameSchema,
		email: EmailSchema,
		username: UsernameSchema,
		password: z.union([PasswordSchema, z.string().min(0).max(0)]).optional(),
		confirmPassword: z
			.union([PasswordSchema, z.string().min(0).max(0)])
			.optional(),
		roles: z
			.array(z.string())
			.min(1, { message: 'At least one role is required' })
			.transform(val => val.map(xssTransform)),
	})
	.superRefine(({ confirmPassword, password, id }, ctx) => {
		// For new users (no id), both password fields are required
		if (!id) {
			if (!password) {
				ctx.addIssue({
					path: ['password'],
					code: 'custom',
					message: 'Password is required for new users',
				})
			}
			if (!confirmPassword) {
				ctx.addIssue({
					path: ['confirmPassword'],
					code: 'custom',
					message: 'Password confirmation is required for new users',
				})
			}
		}

		// If either password field is filled, both must match
		if (password || confirmPassword) {
			if (password !== confirmPassword) {
				ctx.addIssue({
					path: ['confirmPassword'],
					code: 'custom',
					message: 'The passwords must match',
				})
			}
		}
	})
export const UserDeleteSchema = z.object({
	id: z.string(),
})

export function UserEditor({
	user,
	roles,
	title,
	intent,
}: {
	user?: SerializeFrom<
		Pick<User, 'id' | 'name' | 'email' | 'username'> & {
			roles?: Array<Pick<Role, 'id' | 'name'>>
		}
	>
	roles: Array<Pick<Role, 'id' | 'name'>>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema = intent === 'delete' ? UserDeleteSchema : UserEditorSchema
	const [form, fields] = useForm({
		id: 'register-user',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...user,
			roles: user?.roles?.map(role => role.id) ?? [],
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this user? This action cannot be undone.'
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
					to: '/admin/users',
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />

			<div className="space-y-4">
				<Field>
					<Label htmlFor={fields.name.id}>Name</Label>
					<InputField
						meta={fields.name}
						type="text"
						autoComplete="off"
						disabled={disabled}
						className="w-full"
					/>
					{fields.name.errors && <FieldError>{fields.name.errors}</FieldError>}
				</Field>

				<Field>
					<Label htmlFor={fields.email.id}>Email</Label>
					<InputField
						meta={fields.email}
						type="email"
						autoComplete="off"
						disabled={disabled}
						className="w-full"
					/>
					{fields.email.errors && (
						<FieldError>{fields.email.errors}</FieldError>
					)}
				</Field>
			</div>

			<div className="space-y-4">
				<Field>
					<Label htmlFor={fields.username.id}>Username</Label>
					<InputField
						meta={fields.username}
						type="text"
						autoComplete="off"
						disabled={disabled}
						className="w-full"
					/>
					{fields.username.errors && (
						<FieldError>{fields.username.errors}</FieldError>
					)}
				</Field>

				<Field>
					<Label htmlFor={fields.password.id}>Password</Label>
					<InputField meta={fields.password} type="password" />
					{fields.password.errors && (
						<FieldError>{fields.password.errors}</FieldError>
					)}
				</Field>

				<Field>
					<Label htmlFor={fields.confirmPassword.id}>Confirm Password</Label>
					<InputField meta={fields.confirmPassword} type="password" />
					{fields.confirmPassword.errors && (
						<FieldError>{fields.confirmPassword.errors}</FieldError>
					)}
				</Field>

				<Field>
					<fieldset>
						<legend className="mb-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
							Roles
						</legend>
						<CheckboxGroupField
							meta={fields.roles}
							items={roles.map(role => ({
								name: role.name,
								value: role.id,
							}))}
						/>
					</fieldset>
					{fields.roles.errors && (
						<FieldError>{fields.roles.errors}</FieldError>
					)}
				</Field>
			</div>
		</FormCard>
	)
}
