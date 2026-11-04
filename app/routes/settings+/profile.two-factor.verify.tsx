import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { getTOTPAuthUri } from '@epic-web/totp'
import {
	json,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useLoaderData,
	useNavigation,
} from '@remix-run/react'
import { Check, Copy, KeyRound, QrCode, Shield, Type } from 'lucide-react'
import * as QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { StatusButton } from '~/components/ui/status-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { auditRequest } from '~/utils/audit.server'
import { requireUserId } from '~/utils/auth.server'
import {
	twoFAVerificationType,
	twoFAVerifyVerificationType,
} from '~/utils/constants'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { getDomainUrl, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { isCodeValid } from '~/utils/verification.server'

const VerifySchema = z.object({
	code: z
		.string({ required_error: 'Please enter the verification code' })
		.min(6, 'Code must be 6 digits')
		.max(6, 'Code must be 6 digits')
		.regex(/^\d+$/, 'Code must contain only numbers'),
})

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)

	const verification = await prisma.verification.findUnique({
		where: {
			target_type: {
				target: userId,
				type: twoFAVerifyVerificationType,
			},
			expiresAt: { gt: new Date() },
		},
		select: {
			id: true,
			algorithm: true,
			secret: true,
			period: true,
			digits: true,
		},
	})

	if (!verification) {
		return redirect('/settings/profile/two-factor')
	}

	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: { email: true },
	})

	const issuer = new URL(getDomainUrl(request)).host

	const otpUri = getTOTPAuthUri({
		...verification,
		accountName: user.email,
		issuer,
	})

	const qrCode = await QRCode.toDataURL(otpUri)

	return json({
		qrCode,
		secret: verification.secret,
		issuer,
		email: user.email,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	if (formData.get('intent') === 'cancel') {
		await prisma.verification.deleteMany({
			where: { type: twoFAVerifyVerificationType, target: userId },
		})
		return redirect('/settings/profile/two-factor')
	}

	const submission = await parseWithZod(formData, {
		schema: () =>
			VerifySchema.superRefine(async (data, ctx) => {
				const codeIsValid = await isCodeValid({
					code: data.code,
					type: twoFAVerifyVerificationType,
					target: userId,
				})

				if (!codeIsValid) {
					ctx.addIssue({
						path: ['code'],
						code: z.ZodIssueCode.custom,
						message: 'Invalid code. Please check and try again.',
					})
					return z.NEVER
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

	await prisma.verification.update({
		where: {
			target_type: {
				target: userId,
				type: twoFAVerifyVerificationType,
			},
		},
		data: {
			type: twoFAVerificationType,
			expiresAt: null,
		},
	})

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, username: true, email: true, tenantId: true },
	})

	await auditRequest({
		request,
		action: AuditAction.TWO_FACTOR_ENABLE,
		entityType: AuditEntityType.USER,
		entityId: userId,
		description: `Two-factor authentication enabled for ${user?.username}`,
		userId,
		tenantId: user?.tenantId,
		metadata: {
			user: { id: user?.id, username: user?.username, email: user?.email },
		},
	})

	throw await redirectWithToast('/settings/profile/two-factor', {
		type: 'success',
		title: '2FA Enabled',
		description: 'Two-factor authentication has been enabled successfully.',
	})
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		await navigator.clipboard.writeText(text)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={handleCopy}
			className="shrink-0"
		>
			{copied ? (
				<>
					<Check className="mr-2 h-4 w-4" />
					Copied
				</>
			) : (
				<>
					<Copy className="mr-2 h-4 w-4" />
					Copy
				</>
			)}
		</Button>
	)
}

export default function TwoFactorVerifyRoute() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const codeInputRef = useRef<HTMLInputElement>(null)

	const isPending = useIsPending()
	const pendingIntent = isPending ? navigation.formData?.get('intent') : null

	const [form, fields] = useForm({
		id: 'verify-form',
		constraint: getZodConstraint(VerifySchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: VerifySchema })
		},
		shouldRevalidate: 'onBlur',
	})

	// Auto-focus the code input on mount
	useEffect(() => {
		codeInputRef.current?.focus()
	}, [])

	return (
		<div className="mx-auto max-w-lg space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield className="h-5 w-5" />
						Set Up Two-Factor Authentication
					</CardTitle>
					<CardDescription>
						Scan the QR code with your authenticator app to get started
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{/* Step 1: Scan QR Code */}
					<div className="space-y-4">
						<div className="flex items-center gap-3">
							<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
								1
							</div>
							<p className="font-medium">Scan the QR code with your authenticator app</p>
						</div>

						<Tabs defaultValue="qr" className="w-full">
							<TabsList className="grid w-full grid-cols-1 sm:grid-cols-2">
								<TabsTrigger value="qr" className="flex items-center gap-2">
									<QrCode className="h-4 w-4" />
									QR Code
								</TabsTrigger>
								<TabsTrigger value="manual" className="flex items-center gap-2">
									<Type className="h-4 w-4" />
									Manual Entry
								</TabsTrigger>
							</TabsList>

							<TabsContent value="qr" className="mt-4">
								<div className="flex flex-col items-center space-y-4">
									<div className="rounded-xl border-2 border-dashed border-muted-foreground/25 bg-white p-4">
										<img
											alt="QR code for 2FA setup"
											src={data.qrCode}
											className="h-48 w-48"
										/>
									</div>
									<p className="text-center text-sm text-muted-foreground">
										Open your authenticator app and scan this QR code
									</p>
								</div>
							</TabsContent>

							<TabsContent value="manual" className="mt-4">
								<div className="space-y-4">
									<p className="text-sm text-muted-foreground">
										If you can't scan the QR code, manually enter this information in your authenticator app:
									</p>

									<div className="space-y-3">
										<div className="rounded-lg border bg-muted/50 p-3">
											<p className="mb-1 text-xs font-medium text-muted-foreground">Account</p>
											<p className="font-mono text-sm">{data.email}</p>
										</div>

										<div className="rounded-lg border bg-muted/50 p-3">
											<p className="mb-1 text-xs font-medium text-muted-foreground">Issuer</p>
											<p className="font-mono text-sm">{data.issuer}</p>
										</div>

										<div className="rounded-lg border bg-muted/50 p-3">
											<div className="flex items-start justify-between gap-2">
												<div className="min-w-0 flex-1">
													<p className="mb-1 text-xs font-medium text-muted-foreground">Secret Key</p>
													<p className="break-all font-mono text-sm">{data.secret}</p>
												</div>
												<CopyButton text={data.secret} />
											</div>
										</div>
									</div>
								</div>
							</TabsContent>
						</Tabs>
					</div>

					{/* Step 2: Enter Code */}
					<div className="space-y-4">
						<div className="flex items-center gap-3">
							<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
								2
							</div>
							<p className="font-medium">Enter the 6-digit verification code</p>
						</div>

						<div className="rounded-lg border bg-muted/50 p-4">
							<div className="flex items-start gap-3">
								<KeyRound className="mt-0.5 h-5 w-5 text-muted-foreground" />
								<p className="text-sm text-muted-foreground">
									After adding the account, your authenticator app will show a 6-digit code that changes every 30 seconds. Enter the current code below.
								</p>
							</div>
						</div>

						<Form method="POST" {...getFormProps(form)}>
							<AuthenticityTokenInput />

							<div className="space-y-4">
								<Field>
									<Label htmlFor={fields.code.id}>Verification Code</Label>
									<InputField
										meta={fields.code}
										type="text"
										inputMode="numeric"
										autoComplete="one-time-code"
										placeholder="000000"
										maxLength={6}
										className="font-mono text-center text-lg tracking-widest"
									/>
									{fields.code.errors && (
										<FieldError>{fields.code.errors}</FieldError>
									)}
								</Field>

								<div className="flex gap-3">
									<StatusButton
										className="flex-1"
										status={
											pendingIntent === 'verify'
												? 'pending'
												: (actionData?.result?.status ?? 'idle')
										}
										type="submit"
										name="intent"
										value="verify"
										disabled={isPending}
									>
										{isPending && pendingIntent === 'verify' ? 'Verifying...' : 'Verify & Enable 2FA'}
									</StatusButton>
									<Button
										type="submit"
										name="intent"
										value="cancel"
										variant="outline"
										className="flex-1"
										disabled={isPending}
									>
										Cancel
									</Button>
								</div>
							</div>
						</Form>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
