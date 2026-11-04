import { generateTOTP } from '@epic-web/totp'
import {
	json,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, Link, useLoaderData } from '@remix-run/react'
import { CheckCircle2, Shield, ShieldAlert, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react'
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
import { requireUserId } from '~/utils/auth.server'
import {
	twoFAVerificationType,
	twoFAVerifyVerificationType,
} from '~/utils/constants'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { useIsPending } from '~/utils/misc'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const verification = await prisma.verification.findUnique({
		select: { id: true },
		where: {
			target_type: {
				target: userId,
				type: twoFAVerificationType,
			},
		},
	})

	return json({ isTwoFAEnabled: Boolean(verification) })
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const { otp: _otp, ...config } = generateTOTP()
	const verificationData = {
		...config,
		type: twoFAVerifyVerificationType,
		target: userId,
		expiresAt: new Date(Date.now() + 10 * 60 * 1000),
	}

	await prisma.verification.upsert({
		where: {
			target_type: {
				type: twoFAVerifyVerificationType,
				target: userId,
			},
		},
		update: verificationData,
		create: verificationData,
	})

	return redirect('/settings/profile/two-factor/verify')
}

export default function TwoFactorRoute() {
	const data = useLoaderData<typeof loader>()
	const isPending = useIsPending()

	return (
		<div className="mx-auto max-w-lg space-y-6">
			{/* Status Card */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield className="h-5 w-5" />
						Two-Factor Authentication
					</CardTitle>
					<CardDescription>
						Add an extra layer of security to your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					{data.isTwoFAEnabled ? (
						<div className="space-y-6">
							{/* Enabled Status */}
							<div className="flex items-center gap-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
								<div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
									<ShieldCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
								</div>
								<div>
									<p className="font-semibold text-green-700 dark:text-green-300">
										2FA is Enabled
									</p>
									<p className="text-sm text-green-600 dark:text-green-400">
										Your account is protected with two-factor authentication
									</p>
								</div>
							</div>

							{/* Benefits */}
							<div className="space-y-3">
								<p className="text-sm font-medium">With 2FA enabled:</p>
								<div className="space-y-2">
									<div className="flex items-start gap-3">
										<CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
										<p className="text-sm text-muted-foreground">
											You'll enter a code from your authenticator app when logging in
										</p>
									</div>
									<div className="flex items-start gap-3">
										<CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
										<p className="text-sm text-muted-foreground">
											Your account is protected even if your password is compromised
										</p>
									</div>
									<div className="flex items-start gap-3">
										<CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
										<p className="text-sm text-muted-foreground">
											Sensitive actions require verification
										</p>
									</div>
								</div>
							</div>

							{/* Warning */}
							<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
								<div className="flex items-start gap-3">
									<ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
									<div>
										<p className="text-sm font-medium text-amber-700 dark:text-amber-300">
											Keep your authenticator app safe
										</p>
										<p className="text-sm text-amber-600 dark:text-amber-400">
											If you lose access to your authenticator app, you may be locked out of your account.
										</p>
									</div>
								</div>
							</div>

							{/* Actions */}
							<div className="flex gap-3">
								<Button asChild variant="destructive" className="flex-1">
									<Link to="disable">
										<ShieldOff className="mr-2 h-4 w-4" />
										Disable 2FA
									</Link>
								</Button>
								<Button asChild variant="outline" className="flex-1">
									<Link to="/settings/profile">Back to Profile</Link>
								</Button>
							</div>
						</div>
					) : (
						<div className="space-y-6">
							{/* Disabled Status */}
							<div className="flex items-center gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
								<div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
									<ShieldAlert className="h-6 w-6 text-amber-600 dark:text-amber-400" />
								</div>
								<div>
									<p className="font-semibold text-amber-700 dark:text-amber-300">
										2FA is Not Enabled
									</p>
									<p className="text-sm text-amber-600 dark:text-amber-400">
										Your account could be more secure
									</p>
								</div>
							</div>

							{/* How it works */}
							<div className="space-y-3">
								<p className="text-sm font-medium">How it works:</p>
								<div className="space-y-4">
									<div className="flex items-start gap-3">
										<div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
											1
										</div>
										<div>
											<p className="text-sm font-medium">Download an authenticator app</p>
											<p className="text-sm text-muted-foreground">
												Use Google Authenticator, Microsoft Authenticator, or Authy
											</p>
										</div>
									</div>
									<div className="flex items-start gap-3">
										<div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
											2
										</div>
										<div>
											<p className="text-sm font-medium">Scan the QR code</p>
											<p className="text-sm text-muted-foreground">
												Link your account to the authenticator app
											</p>
										</div>
									</div>
									<div className="flex items-start gap-3">
										<div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
											3
										</div>
										<div>
											<p className="text-sm font-medium">Enter the verification code</p>
											<p className="text-sm text-muted-foreground">
												Confirm setup by entering the 6-digit code
											</p>
										</div>
									</div>
								</div>
							</div>

							{/* Supported Apps */}
							<div className="rounded-lg border bg-muted/50 p-4">
								<div className="flex items-center gap-3">
									<Smartphone className="h-5 w-5 text-muted-foreground" />
									<div>
										<p className="text-sm font-medium">Supported authenticator apps</p>
										<p className="text-sm text-muted-foreground">
											Google Authenticator, Microsoft Authenticator, Authy, 1Password, and more
										</p>
									</div>
								</div>
							</div>

							{/* Actions */}
							<Form method="POST">
								<AuthenticityTokenInput />
								<div className="flex gap-3">
									<StatusButton
										type="submit"
										name="intent"
										value="enable"
										status={isPending ? 'pending' : 'idle'}
										disabled={isPending}
										className="flex-1"
									>
										<ShieldCheck className="mr-2 h-4 w-4" />
										{isPending ? 'Setting up...' : 'Enable 2FA'}
									</StatusButton>
									<Button asChild variant="outline" className="flex-1">
										<Link to="/settings/profile">Back to Profile</Link>
									</Button>
								</div>
							</Form>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
