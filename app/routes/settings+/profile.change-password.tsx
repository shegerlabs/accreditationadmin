import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { Form, useActionData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxField } from '~/components/conform/CheckboxField'
import { InputField } from '~/components/conform/InputField'
import { ErrorList, Field, FieldError } from '~/components/forms'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { StatusButton } from '~/components/ui/status-button'
import { auditRequest } from '~/utils/audit.server'
import {
	getPasswordHash,
	logout,
	requireUserId,
	verifyUserPassword,
} from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { PasswordSchema } from '~/utils/validations'

const ChangePasswordSchema = z
	.object({
		currentPassword: z.string({ required_error: 'Current password is required' }),
		newPassword: PasswordSchema,
		confirmPassword: z.string({ required_error: 'Please confirm your password' }),
		logoutAfterChange: z.string().optional().transform(val => val === 'on'),
	})
	.refine(data => data.newPassword === data.confirmPassword, {
		message: 'Passwords do not match',
		path: ['confirmPassword'],
	})

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)

	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)

	const submission = await parseWithZod(formData, {
		schema: ChangePasswordSchema.superRefine(async (data, ctx) => {
			// Verify current password
			try {
				const user = await verifyUserPassword({ id: userId }, data.currentPassword)
				if (!user) {
					ctx.addIssue({
						path: ['currentPassword'],
						code: z.ZodIssueCode.custom,
						message: 'Invalid current password',
					})
				}
			} catch (error) {
				// Handle locked account or other errors
				ctx.addIssue({
					path: ['currentPassword'],
					code: z.ZodIssueCode.custom,
					message: error instanceof Error ? error.message : 'Password verification failed',
				})
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { newPassword, logoutAfterChange } = submission.value

	// Hash the new password and update
	const hash = await getPasswordHash(newPassword)
	await prisma.password.update({
		where: { userId },
		data: { hash },
	})

	// Get user info for audit log
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, username: true, email: true, tenantId: true },
	})

	// Log the password change
	await auditRequest({
		request,
		action: AuditAction.PASSWORD_CHANGE,
		entityType: AuditEntityType.USER,
		entityId: userId,
		description: `Password changed for user ${user?.username}`,
		userId,
		tenantId: user?.tenantId,
		metadata: {
			user: { id: user?.id, username: user?.username, email: user?.email },
			logoutAfterChange,
		},
	})

	// If user chose to logout, redirect to login page
	if (logoutAfterChange) {
		return logout({ request, redirectTo: '/login' })
	}

	return redirectWithToast('/settings/profile', {
		type: 'success',
		title: 'Password Changed',
		description: 'Your password has been updated successfully.',
	})
}

export default function ChangePasswordRoute() {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'change-password-form',
		constraint: getZodConstraint(ChangePasswordSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ChangePasswordSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<Card className="mx-auto max-w-lg">
			<CardHeader>
				<CardTitle className="text-2xl font-bold">Change Password</CardTitle>
				<CardDescription>
					Update your password to keep your account secure.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form className="space-y-6" method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<Field>
						<Label htmlFor={fields.currentPassword.id}>Current Password</Label>
						<InputField
							meta={fields.currentPassword}
							type="password"
							autoComplete="current-password"
							placeholder="Enter your current password"
						/>
						{fields.currentPassword.errors && (
							<FieldError>{fields.currentPassword.errors}</FieldError>
						)}
					</Field>

					<Field>
						<Label htmlFor={fields.newPassword.id}>New Password</Label>
						<InputField
							meta={fields.newPassword}
							type="password"
							autoComplete="new-password"
							placeholder="Enter your new password"
						/>
						{fields.newPassword.errors && (
							<FieldError>{fields.newPassword.errors}</FieldError>
						)}
						<p className="text-sm text-muted-foreground">
							Password must be at least 8 characters with uppercase, lowercase, number, and special character.
						</p>
					</Field>

					<Field>
						<Label htmlFor={fields.confirmPassword.id}>Confirm New Password</Label>
						<InputField
							meta={fields.confirmPassword}
							type="password"
							autoComplete="new-password"
							placeholder="Confirm your new password"
						/>
						{fields.confirmPassword.errors && (
							<FieldError>{fields.confirmPassword.errors}</FieldError>
						)}
					</Field>

					<div className="flex items-center space-x-2">
						<CheckboxField meta={fields.logoutAfterChange} />
						<Label
							htmlFor={fields.logoutAfterChange.id}
							className="text-sm font-normal cursor-pointer"
						>
							Log out after changing password
						</Label>
					</div>

					<ErrorList errors={form.errors} id={form.errorId} />

					<StatusButton
						className="w-full"
						status={isPending ? 'pending' : (form.status ?? 'idle')}
						type="submit"
						disabled={isPending}
					>
						{isPending ? 'Changing Password...' : 'Change Password'}
					</StatusButton>
				</Form>
			</CardContent>
			<CardFooter>
				<p className="text-sm text-muted-foreground">
					Choose to log out after changing your password if you suspect unauthorized access to your account.
				</p>
			</CardFooter>
		</Card>
	)
}
