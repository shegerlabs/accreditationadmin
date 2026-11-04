import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, Link, useNavigation } from '@remix-run/react'
import { AlertTriangle, Shield, ShieldOff, XCircle } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { StatusButton } from '~/components/ui/status-button'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { auditRequest } from '~/utils/audit.server'
import { requireUserId } from '~/utils/auth.server'
import { twoFAVerificationType } from '~/utils/constants'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { useDoubleCheck, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { requireRecentVerification } from '~/utils/verification.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	await requireRecentVerification({ request, userId })
	return json({})
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	await requireRecentVerification({ request, userId })
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, username: true, email: true, tenantId: true },
	})

	await prisma.verification.delete({
		where: {
			target_type: {
				target: userId,
				type: twoFAVerificationType,
			},
		},
	})

	await auditRequest({
		request,
		action: AuditAction.TWO_FACTOR_DISABLE,
		entityType: AuditEntityType.USER,
		entityId: userId,
		description: `Two-factor authentication disabled for ${user?.username}`,
		userId,
		tenantId: user?.tenantId,
		metadata: {
			user: { id: user?.id, username: user?.username, email: user?.email },
		},
	})

	throw await redirectWithToast('/settings/profile/two-factor', {
		type: 'success',
		title: '2FA Disabled',
		description: 'Two-factor authentication has been disabled.',
	})
}

export default function TwoFactorDisableRoute() {
	const isPending = useIsPending()
	const dc = useDoubleCheck()
	const navigation = useNavigation()

	return (
		<div className="mx-auto max-w-lg space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-destructive">
						<ShieldOff className="h-5 w-5" />
						Disable Two-Factor Authentication
					</CardTitle>
					<CardDescription>
						Remove the additional security layer from your account
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{/* Warning Banner */}
					<div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
						<div className="flex items-start gap-3">
							<AlertTriangle className="mt-0.5 h-5 w-5 text-red-600 dark:text-red-400" />
							<div>
								<p className="font-semibold text-red-700 dark:text-red-300">
									Warning: This will reduce your account security
								</p>
								<p className="mt-1 text-sm text-red-600 dark:text-red-400">
									Disabling two-factor authentication will make your account more vulnerable to unauthorized access.
								</p>
							</div>
						</div>
					</div>

					{/* Consequences */}
					<div className="space-y-3">
						<p className="text-sm font-medium">If you disable 2FA:</p>
						<div className="space-y-2">
							<div className="flex items-start gap-3">
								<XCircle className="mt-0.5 h-4 w-4 text-red-500" />
								<p className="text-sm text-muted-foreground">
									You won't need a code to log in anymore
								</p>
							</div>
							<div className="flex items-start gap-3">
								<XCircle className="mt-0.5 h-4 w-4 text-red-500" />
								<p className="text-sm text-muted-foreground">
									Your account will only be protected by your password
								</p>
							</div>
							<div className="flex items-start gap-3">
								<XCircle className="mt-0.5 h-4 w-4 text-red-500" />
								<p className="text-sm text-muted-foreground">
									If someone gets your password, they can access your account
								</p>
							</div>
						</div>
					</div>

					{/* Re-enable note */}
					<div className="rounded-lg border bg-muted/50 p-4">
						<div className="flex items-start gap-3">
							<Shield className="mt-0.5 h-5 w-5 text-muted-foreground" />
							<p className="text-sm text-muted-foreground">
								You can re-enable two-factor authentication at any time from your profile settings.
							</p>
						</div>
					</div>

					{/* Actions */}
					<Form method="POST">
						<AuthenticityTokenInput />
						<div className="flex gap-3">
							<StatusButton
								variant="destructive"
								status={isPending ? 'pending' : 'idle'}
								disabled={isPending}
								{...dc.getButtonProps({
									className: 'flex-1',
									name: 'intent',
									value: 'disable',
									type: 'submit',
								})}
							>
								<ShieldOff className="mr-2 h-4 w-4" />
								{dc.doubleCheck
									? 'Click again to confirm'
									: navigation.state === 'submitting'
										? 'Disabling...'
										: 'Disable 2FA'}
							</StatusButton>
							<Button asChild variant="outline" className="flex-1">
								<Link to="/settings/profile/two-factor">Cancel</Link>
							</Button>
						</div>
					</Form>
				</CardContent>
			</Card>
		</div>
	)
}
