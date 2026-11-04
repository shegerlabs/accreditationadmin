import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Role, Tenant, User } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { Form, useActionData, useNavigate } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxGroupField } from '~/components/conform/CheckboxGroupField'
import { InputField } from '~/components/conform/InputField'
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
import { Label } from '~/components/ui/label'
import { useIsPending } from '~/utils/misc'
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
			.default([])
			.transform(val => val.map(xssTransform)),
		tenantId: z.string().optional(),
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
	tenants,
	isGlobalAdmin,
	isOrphanUser,
	currentUserTenantId,
	title,
	intent,
	returnTo,
}: {
	user?: SerializeFrom<
		Pick<User, 'id' | 'name' | 'email' | 'username' | 'tenantId'> & {
			roles?: Array<Pick<Role, 'id' | 'name'>>
			tenant?: Pick<Tenant, 'id' | 'name'> | null
		}
	>
	roles: Array<Pick<Role, 'id' | 'name'>>
	tenants?: Array<Pick<Tenant, 'id' | 'name'>>
	isGlobalAdmin?: boolean
	isOrphanUser?: boolean
	currentUserTenantId?: string | null
	title: string
	intent?: 'add' | 'edit' | 'delete'
	returnTo?: string
}) {
	const actionData = useActionData<typeof action>()
	const navigate = useNavigate()
	const isPending = useIsPending()

	const isDelete = intent === 'delete'
	const schema = isDelete ? UserDeleteSchema : UserEditorSchema

	// Find the 'user' role ID to ensure it's always included
	const userRoleId = roles.find(r => r.name === 'user')?.id

	// Get default roles - for existing users use their roles, for new users include 'user' role
	const defaultRoles = user?.roles?.map(role => role.id) ?? []
	if (!user && userRoleId && !defaultRoles.includes(userRoleId)) {
		defaultRoles.push(userRoleId)
	}

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
			roles: defaultRoles,
			tenantId: user?.tenantId ?? '__none__',
		},
	})

	const handleClose = () => navigate(returnTo ?? '/admin/users')

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent
				className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{isDelete
							? 'Are you sure you want to delete this user? This action cannot be undone.'
							: intent === 'edit'
								? 'Update the user details below.'
								: 'Fill in the details to create a new user.'}
					</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<InputField meta={fields.id} type="hidden" />
					<input type="hidden" name="intent" value={intent} />

					{!isDelete && (
						<div className="grid gap-4 py-4">
							<Field>
								<Label htmlFor={fields.name.id}>Name</Label>
								<InputField
									meta={fields.name}
									type="text"
									autoComplete="off"
								/>
								{fields.name.errors && (
									<FieldError>{fields.name.errors}</FieldError>
								)}
							</Field>

							<Field>
								<Label htmlFor={fields.email.id}>Email</Label>
								<InputField
									meta={fields.email}
									type="email"
									autoComplete="off"
								/>
								{fields.email.errors && (
									<FieldError>{fields.email.errors}</FieldError>
								)}
							</Field>

							<Field>
								<Label htmlFor={fields.username.id}>Username</Label>
								<InputField
									meta={fields.username}
									type="text"
									autoComplete="off"
								/>
								{fields.username.errors && (
									<FieldError>{fields.username.errors}</FieldError>
								)}
							</Field>

							<Field>
								<Label htmlFor={fields.password.id}>Password</Label>
								<InputField meta={fields.password} type="password" />
								{user && (
									<p className="text-xs text-muted-foreground">
										Leave empty to keep current password.
									</p>
								)}
								{fields.password.errors && (
									<FieldError>{fields.password.errors}</FieldError>
								)}
							</Field>

							<Field>
								<Label htmlFor={fields.confirmPassword.id}>
									Confirm Password
								</Label>
								<InputField meta={fields.confirmPassword} type="password" />
								{fields.confirmPassword.errors && (
									<FieldError>{fields.confirmPassword.errors}</FieldError>
								)}
							</Field>

							{/* Only show role selection for global admins (who have roles to choose from) */}
							{roles.length > 0 && (
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
												disabled: role.name === 'user',
											}))}
										/>
									</fieldset>
									{fields.roles.errors && (
										<FieldError>{fields.roles.errors}</FieldError>
									)}
								</Field>
							)}

							{/* Tenant assignment */}
							{/* Global admins can assign any tenant */}
							{isGlobalAdmin && tenants && tenants.length > 0 && (
								<Field>
									<Label htmlFor={fields.tenantId.id}>Tenant</Label>
									<SelectField
										meta={fields.tenantId}
										items={[
											{ name: 'No Tenant (Global User)', value: '__none__' },
											...tenants.map(tenant => ({
												name: tenant.name,
												value: tenant.id,
											})),
										]}
										placeholder="Select a tenant..."
									/>
									<p className="text-xs text-muted-foreground">
										Assign this user to a tenant to make them a tenant admin.
									</p>
									{fields.tenantId.errors && (
										<FieldError>{fields.tenantId.errors}</FieldError>
									)}
								</Field>
							)}

							{/* Tenant admins editing orphan users can assign to their tenant */}
							{!isGlobalAdmin && isOrphanUser && tenants && tenants.length > 0 && (
								<Field>
									<Label htmlFor={fields.tenantId.id}>Tenant</Label>
									<SelectField
										meta={fields.tenantId}
										items={[
											{ name: 'Unassigned', value: '__none__' },
											...tenants.map(tenant => ({
												name: tenant.name,
												value: tenant.id,
											})),
										]}
										placeholder="Select a tenant..."
									/>
									<p className="text-xs text-muted-foreground">
										Assign this user to your tenant to manage them.
									</p>
									{fields.tenantId.errors && (
										<FieldError>{fields.tenantId.errors}</FieldError>
									)}
								</Field>
							)}

							{/* Tenant admins creating new users - show auto-assigned tenant as read-only */}
							{!isGlobalAdmin && !user && currentUserTenantId && tenants && tenants.length > 0 && (
								<Field>
									<Label>Tenant</Label>
									<div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm">
										{tenants.find(t => t.id === currentUserTenantId)?.name ?? 'Your Tenant'}
										<span className="ml-2 text-xs text-muted-foreground">(auto-assigned)</span>
									</div>
									<input type="hidden" name="tenantId" value={currentUserTenantId} />
								</Field>
							)}
						</div>
					)}

					{isDelete && user && (
						<div className="space-y-4 py-4">
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
								<div>
									<span className="text-muted-foreground">Name:</span>{' '}
									<span className="font-medium">{user.name}</span>
								</div>
								<div>
									<span className="text-muted-foreground">Email:</span>{' '}
									<span className="font-medium">{user.email}</span>
								</div>
								<div>
									<span className="text-muted-foreground">Username:</span>{' '}
									<span className="font-medium">{user.username}</span>
								</div>
								{user.roles && user.roles.length > 0 && (
									<div>
										<span className="text-muted-foreground">Roles:</span>{' '}
										<span className="font-medium">
											{user.roles.map(r => r.name).join(', ')}
										</span>
									</div>
								)}
								{user.tenant && (
									<div>
										<span className="text-muted-foreground">Tenant:</span>{' '}
										<span className="font-medium">{user.tenant.name}</span>
									</div>
								)}
							</div>
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
