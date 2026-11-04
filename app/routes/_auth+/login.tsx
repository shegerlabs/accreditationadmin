import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	ActionFunctionArgs,
	LoaderFunctionArgs,
	redirect,
} from '@remix-run/node'
import {
	Form,
	json,
	Link,
	useActionData,
	useSearchParams,
} from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { z } from 'zod'
import { CheckboxField } from '~/components/conform/CheckboxField'
import { InputField } from '~/components/conform/InputField'
import { ErrorList, Field, FieldError } from '~/components/forms'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { StatusButton } from '~/components/ui/status-button'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { auditRequest } from '~/utils/audit.server'
import { login, requireAnonymous, sessionKey } from '~/utils/auth.server'
import {
	rememberMeSessionKey,
	twoFAVerificationType,
	unverifiedSessionIdKey,
} from '~/utils/constants'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { useIsPending } from '~/utils/misc'
import { sessionStorage } from '~/utils/session.server'
import { PasswordSchema, UsernameSchema } from '~/utils/validations'
import {
	getRedirectToUrl,
	shouldRequestTwoFA,
	verifySessionStorage,
} from '~/utils/verification.server'

export const LoginFormSchema = z.object({
	username: UsernameSchema,
	password: PasswordSchema,
	remember: z.boolean().optional(),
	redirectTo: z.string().optional(),
})

export async function loader({ request }: LoaderFunctionArgs) {
	await requireAnonymous(request)
	return json({})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireAnonymous(request)
	const formData = await request.formData()
	checkHoneypot(formData)

	const submission = await parseWithZod(formData, {
		schema: intent =>
			LoginFormSchema.transform(async (data, ctx) => {
				if (intent !== null) return { ...data, session: null }

				try {
					const session = await login({
						username: data.username,
						password: data.password,
						request,
					})

					if (!session) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: 'Invalid username or password',
						})
						return z.NEVER
					}

					// Check if user has an allowed role (not just 'user' or 'focal')
					const allowedRoles = ['admin', 'tenant', 'validator', 'reviewer', 'printer', 'dispatcher', 'checkpoint']
					const userWithRoles = await prisma.user.findUnique({
						where: { id: session.userId },
						select: { roles: { select: { name: true } } },
					})

					const hasAllowedRole = userWithRoles?.roles.some(role =>
						allowedRoles.includes(role.name),
					)

					if (!hasAllowedRole) {
						// Delete the session we just created
						await prisma.session.delete({ where: { id: session.id } })
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: 'You do not have permission to access this platform',
						})
						return z.NEVER
					}

					return { ...data, session }
				} catch (error) {
					// Handle lockout errors
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message:
							error instanceof Error
								? error.message
								: 'An error occurred during login',
					})
					return z.NEVER
				}
			}),
		async: true,
	})

	if (submission.status !== 'success' || !submission.value.session) {
		// Log failed login attempt
		const username = formData.get('username')?.toString()
		if (username) {
			const user = await prisma.user.findUnique({
				where: { username },
				select: { id: true, tenantId: true },
			})
			await auditRequest({
				request,
				action: AuditAction.LOGIN_FAILED,
				entityType: AuditEntityType.USER,
				entityId: user?.id,
				description: `Failed login attempt for username: ${username}`,
				tenantId: user?.tenantId,
				metadata: {
					username,
					reason: user ? 'Invalid password' : 'User not found',
				},
			})
		}

		return json(
			{ result: submission.reply({ hideFields: ['password'] }) },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { session, remember, redirectTo } = submission.value

	// Fetch user details for audit log
	const user = await prisma.user.findUnique({
		where: { id: session.userId },
		select: { id: true, username: true, email: true, name: true, tenantId: true },
	})

	if (await shouldRequestTwoFA({ request, userId: session.userId })) {
		const verifySession = await verifySessionStorage.getSession()
		verifySession.set(unverifiedSessionIdKey, session.id)
		verifySession.set(rememberMeSessionKey, remember)

		const redirectUrl = getRedirectToUrl({
			request,
			target: session.userId,
			type: twoFAVerificationType,
			redirectTo,
		})

		// Log login with 2FA pending
		await auditRequest({
			request,
			action: AuditAction.LOGIN,
			entityType: AuditEntityType.SESSION,
			entityId: session.id,
			description: `Login initiated for ${user?.username} - awaiting 2FA verification`,
			userId: session.userId,
			tenantId: user?.tenantId,
			metadata: {
				user: { id: user?.id, username: user?.username, email: user?.email },
				sessionId: session.id,
				rememberMe: remember,
				twoFactorRequired: true,
			},
		})

		return redirect(redirectUrl.toString(), {
			headers: {
				'set-cookie': await verifySessionStorage.commitSession(verifySession),
			},
		})
	} else {
		const cookieSession = await sessionStorage.getSession(
			request.headers.get('cookie'),
		)
		cookieSession.set(sessionKey, session.id)

		// Log successful login
		await auditRequest({
			request,
			action: AuditAction.LOGIN,
			entityType: AuditEntityType.SESSION,
			entityId: session.id,
			description: `Successful login for ${user?.username}`,
			userId: session.userId,
			tenantId: user?.tenantId,
			metadata: {
				user: { id: user?.id, username: user?.username, email: user?.email },
				sessionId: session.id,
				rememberMe: remember,
				twoFactorRequired: false,
			},
		})

		return redirect(safeRedirect(redirectTo), {
			headers: {
				'set-cookie': await sessionStorage.commitSession(cookieSession, {
					expires: remember ? session.expirationDate : undefined,
				}),
			},
		})
	}
}

export default function LoginRoute() {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [searchParams] = useSearchParams()
	const redirectTo = searchParams.get('redirectTo')
	const [form, fields] = useForm({
		id: 'login-form',
		constraint: getZodConstraint(LoginFormSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: LoginFormSchema })
		},
		shouldRevalidate: 'onBlur',
		defaultValue: {
			redirectTo,
		},
	})

	return (
		<div className="flex min-h-full items-center justify-center p-4">
			<Card className="mx-auto max-w-lg">
				<CardHeader>
					<CardTitle className="text-2xl">Login</CardTitle>
					<CardDescription>
						Enter your credentials below to login to your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Form className="grid gap-4" method="POST" {...getFormProps(form)}>
						<AuthenticityTokenInput />
						<HoneypotInputs />
						<InputField meta={fields.redirectTo} type="hidden" />
						<div className="grid gap-4">
							<Field>
								<Label htmlFor={fields.username.id}>Username</Label>
								<InputField meta={fields.username} type="text" />
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

							<div className="flex items-center gap-2">
								<CheckboxField meta={fields.remember} />
								<Label htmlFor={fields.remember.id}>Remember me</Label>

								<Link
									to="/forgot-password"
									className="ml-auto inline-block text-sm underline"
								>
									Forgot your password?
								</Link>
							</div>

							<ErrorList errors={form.errors} id={form.errorId} />

							<StatusButton
								className="w-full"
								status={isPending ? 'pending' : (form.status ?? 'idle')}
								type="submit"
								disabled={isPending}
							>
								Login
							</StatusButton>
						</div>
						{/* <div className="mt-4 text-center text-sm">
							Don&apos;t have an account?{' '}
							<Link
								to={
									redirectTo
										? `/signup?redirectTo=${encodeURIComponent(redirectTo)}`
										: '/signup'
								}
								className="underline"
							>
								Sign up
							</Link>
						</div> */}
					</Form>
				</CardContent>
			</Card>
		</div>
	)
}
