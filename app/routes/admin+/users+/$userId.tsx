import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Form, Link, Outlet, useFetcher, useLoaderData } from '@remix-run/react'
import { format } from 'date-fns'
import {
	ArrowLeft,
	CalendarDays,
	KeyRound,
	Lock,
	LockOpen,
	LogOut,
	Mail,
	Monitor,
	Pencil,
	Shield,
	Trash2,
	User,
	UserCheck,
	Users,
} from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { CheckboxField } from '~/components/conform/CheckboxField'
import { InputField } from '~/components/conform/InputField'
import { Field, FieldError } from '~/components/forms'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { Separator } from '~/components/ui/separator'
import { StatusButton } from '~/components/ui/status-button'
import { auditRequest } from '~/utils/audit.server'
import { getPasswordHash, requireAdminAccess } from '~/utils/auth.server'
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { sendEmailAzure } from '~/utils/email.server'
import { invariantResponse, useDoubleCheck } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

const ActionSchema = z.discriminatedUnion('intent', [
	z.object({
		intent: z.literal('reset-password'),
		newPassword: z
			.string()
			.min(8, 'Password must be at least 8 characters')
			.max(100),
		notifyUser: z.string().optional().transform(val => val === 'on'),
	}),
	z.object({
		intent: z.literal('lock-user'),
	}),
	z.object({
		intent: z.literal('unlock-user'),
	}),
	z.object({
		intent: z.literal('revoke-session'),
		sessionId: z.string(),
	}),
	z.object({
		intent: z.literal('revoke-all-sessions'),
	}),
])

export async function loader({ params, request }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const { userId } = params

	// Global admins can access any user
	// Tenant admins can access their own tenant's users OR orphan users (tenantId = null)
	const user = await prisma.user.findFirst({
		where: currentUser.isGlobalAdmin
			? { id: userId }
			: {
					id: userId,
					OR: [
						{ tenantId: currentUser.tenantId },
						{ tenantId: null },
					],
				},
		include: {
			roles: {
				select: { id: true, name: true, scope: true },
			},
			tenant: {
				select: { id: true, name: true },
			},
			image: {
				select: { id: true },
			},
			sessions: {
				where: {
					expirationDate: { gt: new Date() },
				},
				select: {
					id: true,
					createdAt: true,
					expirationDate: true,
					metadata: true,
				},
				orderBy: { createdAt: 'desc' },
			},
			_count: {
				select: {
					sessions: {
						where: {
							expirationDate: { gt: new Date() },
						},
					},
					approvals: true,
					participants: true,
				},
			},
		},
	})

	invariantResponse(user, 'User not found', { status: 404 })

	// Get recent audit logs for this user
	const recentActivity = await prisma.auditLog.findMany({
		where: {
			OR: [
				{ userId: userId },
				{ entityId: userId, entityType: AuditEntityType.USER },
			],
		},
		select: {
			id: true,
			action: true,
			description: true,
			createdAt: true,
			ipAddress: true,
		},
		orderBy: { createdAt: 'desc' },
		take: 5,
	})

	// Get max lock count setting
	const maxLockCount = await getSetting<number>(SettingKeys.AUTH_MAX_LOCK_COUNT)

	return json({
		user,
		recentActivity,
		isGlobalAdmin: currentUser.isGlobalAdmin,
		canImpersonate: currentUser.isGlobalAdmin || currentUser.isTenantAdmin === true,
		currentUserId: currentUser.id,
		maxLockCount,
	})
}

export async function action({ params, request }: ActionFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const { userId } = params

	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	// Verify the target user exists and admin has access
	// Tenant admins can manage their own tenant's users OR orphan users
	const targetUser = await prisma.user.findFirst({
		where: currentUser.isGlobalAdmin
			? { id: userId }
			: {
					id: userId,
					OR: [
						{ tenantId: currentUser.tenantId },
						{ tenantId: null },
					],
				},
		select: {
			id: true,
			username: true,
			email: true,
			tenantId: true,
			status: true,
		},
	})

	invariantResponse(targetUser, 'User not found', { status: 404 })

	const submission = parseWithZod(formData, { schema: ActionSchema })

	if (submission.status !== 'success') {
		return json(
			{ status: 'error' as const, error: 'Invalid submission' },
			{ status: 400 },
		)
	}

	const { intent } = submission.value

	switch (intent) {
		case 'reset-password': {
			const { newPassword, notifyUser } = submission.value
			const hash = await getPasswordHash(newPassword)

			await prisma.password.upsert({
				where: { userId: targetUser.id },
				update: { hash },
				create: { userId: targetUser.id, hash },
			})

			// Send email notification if requested
			let emailSent = false
			if (notifyUser && targetUser.email) {
				const emailResult = await sendEmailAzure({
					to: targetUser.email,
					subject: 'Your Password Has Been Reset',
					plainText: `Hello ${targetUser.username},\n\nYour password has been reset by an administrator.\n\nYour new password is: ${newPassword}\n\nPlease log in and change your password as soon as possible.\n\nIf you did not expect this change, please contact your administrator immediately.`,
					html: `
						<p>Hello ${targetUser.username},</p>
						<p>Your password has been reset by an administrator.</p>
						<p><strong>Your new password is:</strong> ${newPassword}</p>
						<p>Please log in and change your password as soon as possible.</p>
						<p>If you did not expect this change, please contact your administrator immediately.</p>
					`,
				})
				emailSent = emailResult.status === 'success'
			}

			await auditRequest({
				request,
				action: AuditAction.PASSWORD_RESET,
				entityType: AuditEntityType.USER,
				entityId: targetUser.id,
				description: `Password reset by admin for ${targetUser.username}${notifyUser ? (emailSent ? ' (email sent)' : ' (email failed)') : ''}`,
				userId: currentUser.id,
				tenantId: targetUser.tenantId,
				metadata: {
					targetUser: {
						id: targetUser.id,
						username: targetUser.username,
						email: targetUser.email,
					},
					performedBy: currentUser.id,
					notifyUser,
					emailSent,
				},
			})

			const message = notifyUser
				? emailSent
					? 'Password reset and email sent to user'
					: 'Password reset but email failed to send'
				: 'Password reset successfully'

			return json({ status: 'success' as const, message })
		}

		case 'lock-user': {
			await prisma.user.update({
				where: { id: targetUser.id },
				data: {
					status: 'LOCKED',
					lockedAt: new Date(),
					lockReason: 'Locked by administrator',
					lockCount: { increment: 1 },
				},
			})

			await auditRequest({
				request,
				action: AuditAction.UPDATE,
				entityType: AuditEntityType.USER,
				entityId: targetUser.id,
				description: `User ${targetUser.username} locked by admin`,
				userId: currentUser.id,
				tenantId: targetUser.tenantId,
				metadata: {
					targetUser: {
						id: targetUser.id,
						username: targetUser.username,
					},
					action: 'lock',
				},
			})

			return json({ status: 'success' as const, message: 'User locked successfully' })
		}

		case 'unlock-user': {
			await prisma.user.update({
				where: { id: targetUser.id },
				data: {
					status: 'ACTIVE',
					failedLoginAttempts: 0,
					lockedAt: null,
					lockReason: null,
					autoUnlockAt: null,
					lockCount: 0,
				},
			})

			await auditRequest({
				request,
				action: AuditAction.UPDATE,
				entityType: AuditEntityType.USER,
				entityId: targetUser.id,
				description: `User ${targetUser.username} unlocked by admin`,
				userId: currentUser.id,
				tenantId: targetUser.tenantId,
				metadata: {
					targetUser: {
						id: targetUser.id,
						username: targetUser.username,
					},
					action: 'unlock',
				},
			})

			return json({ status: 'success' as const, message: 'User unlocked successfully' })
		}

		case 'revoke-session': {
			const { sessionId } = submission.value

			await prisma.session.delete({
				where: { id: sessionId, userId: targetUser.id },
			})

			await auditRequest({
				request,
				action: AuditAction.SESSION_REVOKE,
				entityType: AuditEntityType.SESSION,
				entityId: sessionId,
				description: `Session revoked for ${targetUser.username} by admin`,
				userId: currentUser.id,
				tenantId: targetUser.tenantId,
				metadata: {
					targetUser: {
						id: targetUser.id,
						username: targetUser.username,
					},
					sessionId,
				},
			})

			return json({ status: 'success' as const, message: 'Session revoked' })
		}

		case 'revoke-all-sessions': {
			const result = await prisma.session.deleteMany({
				where: { userId: targetUser.id },
			})

			await auditRequest({
				request,
				action: AuditAction.SESSION_REVOKE,
				entityType: AuditEntityType.SESSION,
				entityId: targetUser.id,
				description: `All sessions (${result.count}) revoked for ${targetUser.username} by admin`,
				userId: currentUser.id,
				tenantId: targetUser.tenantId,
				metadata: {
					targetUser: {
						id: targetUser.id,
						username: targetUser.username,
					},
					sessionsRevoked: result.count,
				},
			})

			return json({
				status: 'success' as const,
				message: `${result.count} session(s) revoked`,
			})
		}
	}
}


const ResetPasswordSchema = z.object({
	newPassword: z
		.string()
		.min(8, 'Password must be at least 8 characters')
		.max(100),
	notifyUser: z.string().optional(),
})

export default function UserDetailRoute() {
	const { user, recentActivity, isGlobalAdmin, canImpersonate, currentUserId } =
		useLoaderData<typeof loader>()
	const fetcher = useFetcher<typeof action>()
	const lockDc = useDoubleCheck()
	const revokeAllDc = useDoubleCheck()

	const [resetPasswordForm, resetPasswordFields] = useForm({
		id: 'reset-password-form',
		constraint: getZodConstraint(ResetPasswordSchema),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ResetPasswordSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
	})

	const isCurrentUser = user.id === currentUserId

	return (
		<div className="space-y-6">
			<Outlet />
			<div className="grid gap-6 lg:grid-cols-3">
				{/* User Information */}
				<div className="lg:col-span-2 space-y-6">
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle className="flex items-center gap-2 text-base">
									<User className="h-5 w-5" />
									User Information
								</CardTitle>
								<div className="flex items-center gap-2">
									<Link to="/admin/users">
										<Button variant="ghost" size="sm">
											<ArrowLeft className="mr-2 h-4 w-4" />
											Back
										</Button>
									</Link>
									<Link to={`/admin/users/${user.id}/edit`}>
										<Button variant="outline" size="sm">
											<Pencil className="mr-2 h-4 w-4" />
											Edit
										</Button>
									</Link>
									<Link to={`/admin/users/${user.id}/delete`}>
										<Button variant="destructive" size="sm">
											<Trash2 className="mr-2 h-4 w-4" />
											Delete
										</Button>
									</Link>
								{!isCurrentUser && canImpersonate && (
									<Form
										method="POST"
										action={`/admin/users/${user.id}/impersonate`}
									>
										<Button type="submit" variant="secondary" size="sm">
											<UserCheck className="mr-2 h-4 w-4" />
											Impersonate
										</Button>
									</Form>
								)}
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<dl className="grid gap-2 text-sm">
								<div className="flex justify-between py-1">
									<dt className="text-muted-foreground">Email</dt>
									<dd className="font-medium">{user.email}</dd>
								</div>
								<div className="flex justify-between py-1">
									<dt className="text-muted-foreground">Tenant</dt>
									<dd className="font-medium">{user.tenant?.name ?? 'No tenant'}</dd>
								</div>
								<div className="flex justify-between py-1">
									<dt className="text-muted-foreground">Member since</dt>
									<dd className="font-medium">{format(new Date(user.createdAt), 'MMM d, yyyy')}</dd>
								</div>
								<div className="flex justify-between items-start py-1">
									<dt className="text-muted-foreground">Roles</dt>
									<dd className="flex flex-wrap gap-1 justify-end">
										{user.roles.map(role => (
											<Badge key={role.id} variant="secondary" className="text-xs">
												{role.name}
											</Badge>
										))}
									</dd>
								</div>
							</dl>

						</CardContent>
					</Card>

					{/* Active Sessions */}
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<div>
									<CardTitle className="flex items-center gap-2 text-base">
										<Monitor className="h-5 w-5" />
										Active Sessions
									</CardTitle>
									<CardDescription>
										{user.sessions.length} active session(s)
									</CardDescription>
								</div>
								{user.sessions.length > 0 && (
									<fetcher.Form method="POST">
										<AuthenticityTokenInput />
										<input type="hidden" name="intent" value="revoke-all-sessions" />
										<StatusButton
											{...revokeAllDc.getButtonProps({ type: 'submit' })}
											variant={revokeAllDc.doubleCheck ? 'destructive' : 'outline'}
											size="sm"
											status={
												fetcher.state !== 'idle' &&
												fetcher.formData?.get('intent') === 'revoke-all-sessions'
													? 'pending'
													: 'idle'
											}
											disabled={fetcher.state !== 'idle'}
										>
											<LogOut className="mr-2 h-4 w-4" />
											{revokeAllDc.doubleCheck ? 'Confirm Revoke All' : 'Revoke All'}
										</StatusButton>
									</fetcher.Form>
								)}
							</div>
						</CardHeader>
						<CardContent>
							{user.sessions.length === 0 ? (
								<p className="text-center text-muted-foreground py-8">
									No active sessions
								</p>
							) : (
								<div className="space-y-3">
									{user.sessions.map(session => {
										const metadata = session.metadata as {
											userAgent?: string
											ipAddress?: string
										} | null
										return (
											<div
												key={session.id}
												className="flex items-center justify-between rounded-lg border p-4"
											>
												<div className="flex items-center gap-3">
													<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
														<Monitor className="h-5 w-5 text-muted-foreground" />
													</div>
													<div>
														<p className="text-sm font-medium">
															Session created{' '}
															{format(new Date(session.createdAt), 'MMM d, yyyy HH:mm')}
														</p>
														<p className="text-xs text-muted-foreground">
															Expires{' '}
															{format(new Date(session.expirationDate), 'MMM d, yyyy')}
														</p>
													</div>
												</div>
												<fetcher.Form method="POST">
													<AuthenticityTokenInput />
													<input type="hidden" name="intent" value="revoke-session" />
													<input type="hidden" name="sessionId" value={session.id} />
													<Button
														type="submit"
														variant="ghost"
														size="sm"
														disabled={fetcher.state !== 'idle'}
													>
														<LogOut className="h-4 w-4" />
													</Button>
												</fetcher.Form>
											</div>
										)
									})}
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Sidebar - Actions & Activity */}
				<div className="space-y-6">
					{/* Security Actions */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<Shield className="h-5 w-5" />
								Security Actions
							</CardTitle>
							<CardDescription>
								Manage user security settings
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{/* Reset Password */}
							<fetcher.Form
								method="POST"
								{...getFormProps(resetPasswordForm)}
								className="space-y-3"
							>
								<AuthenticityTokenInput />
								<input type="hidden" name="intent" value="reset-password" />
								<Field>
									<Label htmlFor={resetPasswordFields.newPassword.id}>
										New Password
									</Label>
									<InputField
										meta={resetPasswordFields.newPassword}
										type="password"
										placeholder="Enter new password"
									/>
									{resetPasswordFields.newPassword.errors && (
										<FieldError>
											{resetPasswordFields.newPassword.errors}
										</FieldError>
									)}
								</Field>
								<div className="flex items-center gap-2">
									<CheckboxField meta={resetPasswordFields.notifyUser} />
									<Label
										htmlFor={resetPasswordFields.notifyUser.id}
										className="text-sm text-muted-foreground"
									>
										Email new password to user
									</Label>
								</div>
								<StatusButton
									type="submit"
									variant="outline"
									size="sm"
									className="w-full"
									status={
										fetcher.state !== 'idle' &&
										fetcher.formData?.get('intent') === 'reset-password'
											? 'pending'
											: 'idle'
									}
									disabled={fetcher.state !== 'idle'}
								>
									<KeyRound className="mr-2 h-4 w-4" />
									Reset Password
								</StatusButton>
							</fetcher.Form>

							<Separator />

							{/* Lock/Unlock User */}
							{!isCurrentUser && (
								<>
									{user.status === 'LOCKED' ? (
										<fetcher.Form method="POST">
											<AuthenticityTokenInput />
											<input type="hidden" name="intent" value="unlock-user" />
											<StatusButton
												type="submit"
												variant="outline"
												size="sm"
												className="w-full"
												status={
													fetcher.state !== 'idle' &&
													fetcher.formData?.get('intent') === 'unlock-user'
														? 'pending'
														: 'idle'
												}
												disabled={fetcher.state !== 'idle'}
											>
												<LockOpen className="mr-2 h-4 w-4" />
												Unlock User
											</StatusButton>
										</fetcher.Form>
									) : (
										<fetcher.Form method="POST">
											<AuthenticityTokenInput />
											<input type="hidden" name="intent" value="lock-user" />
											<StatusButton
												{...lockDc.getButtonProps({ type: 'submit' })}
												variant={lockDc.doubleCheck ? 'destructive' : 'outline'}
												size="sm"
												className="w-full"
												status={
													fetcher.state !== 'idle' &&
													fetcher.formData?.get('intent') === 'lock-user'
														? 'pending'
														: 'idle'
												}
												disabled={fetcher.state !== 'idle'}
											>
												<Lock className="mr-2 h-4 w-4" />
												{lockDc.doubleCheck ? 'Confirm Lock' : 'Lock User'}
											</StatusButton>
										</fetcher.Form>
									)}
								</>
							)}

							{isCurrentUser && (
								<p className="text-sm text-muted-foreground text-center py-2">
									You cannot lock your own account
								</p>
							)}

							{/* Action feedback */}
							{fetcher.data?.status === 'success' && (
								<div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/50 dark:text-green-300">
									{fetcher.data.message}
								</div>
							)}
							{fetcher.data?.status === 'error' && (
								<div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/50 dark:text-red-300">
									{fetcher.data.error}
								</div>
							)}
						</CardContent>
					</Card>

					{/* Recent Activity */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								Recent Activity
							</CardTitle>
						</CardHeader>
						<CardContent>
							{recentActivity.length === 0 ? (
								<p className="text-center text-sm text-muted-foreground py-4">
									No recent activity
								</p>
							) : (
								<div className="space-y-3">
									{recentActivity.map(log => (
										<div
											key={log.id}
											className="border-l-2 border-muted pl-3 py-1"
										>
											<p className="text-sm">{log.description}</p>
											<p className="text-xs text-muted-foreground">
												{format(new Date(log.createdAt), 'MMM d, HH:mm')}
												{log.ipAddress && ` · ${log.ipAddress}`}
											</p>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
