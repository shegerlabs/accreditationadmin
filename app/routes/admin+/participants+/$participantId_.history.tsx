import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Form, Link, useLoaderData, useNavigation } from '@remix-run/react'
import { format } from 'date-fns'
import {
	ArrowLeft,
	CheckCircleIcon,
	CircleDashedIcon,
	ClockIcon,
	HistoryIcon,
	MailIcon,
	RotateCwIcon,
	SkipForwardIcon,
	UserIcon,
	XCircleIcon,
} from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Separator } from '~/components/ui/separator'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { EMAIL_TEMPLATE_DEFAULTS } from '~/utils/participant-email'
import { resendEmail } from '~/utils/participant-email.server'
import { redirectWithToast } from '~/utils/toast.server'

const SYSTEM_STEPS = ['Request Received', 'Review Request']

function isSystemStep(stepName: string): boolean {
	return SYSTEM_STEPS.some(name =>
		stepName.toLowerCase().includes(name.toLowerCase()),
	)
}

function getApproverDisplay(approval: { step: { name: string }; user?: { username: string } | null }): string {
	if (isSystemStep(approval.step.name)) {
		return 'System'
	}
	return approval.user?.username || 'System'
}

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		select: {
			id: true,
			firstName: true,
			familyName: true,
			registrationCode: true,
			email: true,
			organization: true,
			status: true,
			createdAt: true,
			event: {
				select: {
					id: true,
					name: true,
				},
			},
			participantType: {
				select: {
					id: true,
					name: true,
				},
			},
			step: {
				select: {
					id: true,
					name: true,
					action: true,
					order: true,
					role: {
						select: {
							name: true,
						},
					},
				},
			},
			approvals: {
				orderBy: {
					createdAt: 'asc',
				},
				select: {
					id: true,
					action: true,
					result: true,
					remarks: true,
					createdAt: true,
					step: {
						select: {
							id: true,
							name: true,
							order: true,
							role: {
								select: {
									name: true,
								},
							},
						},
					},
					user: {
						select: {
							id: true,
							username: true,
							name: true,
						},
					},
				},
			},
			emailLogs: {
				orderBy: { createdAt: 'desc' },
				select: {
					id: true,
					trigger: true,
					recipient: true,
					subject: true,
					body: true,
					status: true,
					error: true,
					createdAt: true,
					triggeredBy: { select: { username: true } },
				},
			},
		},
	})

	invariantResponse(participant, 'Participant not found', { status: 404 })

	return json({ participant })
}

export async function action({ params, request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	const emailLogId = formData.get('emailLogId')
	invariantResponse(typeof emailLogId === 'string', 'Email not found', { status: 400 })
	const emailLog = await prisma.emailLog.findFirst({
		where: { id: emailLogId, participantId: params.participantId },
		select: { id: true, participant: { select: { tenantId: true } } },
	})
	invariantResponse(emailLog, 'Email not found', { status: 404 })

	const resent = await resendEmail(emailLog.id, user.id)
	await auditRequest({
		request,
		action: AuditAction.OTHER,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: params.participantId,
		description: `Resent "${resent.subject}" to ${resent.recipient}`,
		userId: user.id,
		tenantId: emailLog.participant.tenantId,
		metadata: { emailLogId: emailLog.id, trigger: resent.trigger },
	})

	return redirectWithToast(`/admin/participants/${params.participantId}/history`, {
		type: 'success',
		title: 'Email resent',
		description: `Sending to ${resent.recipient}. The status below updates when you refresh.`,
	})
}

const emailStatusStyles: Record<string, string> = {
	SENT: 'bg-green-100 text-green-800',
	FAILED: 'bg-red-100 text-red-800',
	PENDING: 'bg-gray-100 text-gray-800',
}

export default function ParticipantHistoryRoute() {
	const { participant } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const resendingId =
		navigation.state !== 'idle' ? navigation.formData?.get('emailLogId') : null

	const getActionLabel = (action: string) => {
		const labels: Record<string, string> = {
			APPROVE: 'Approved',
			REJECT: 'Rejected',
			PRINT: 'Printed',
			COLLECT: 'Collected',
			NOTIFY: 'Notified',
			ARCHIVE: 'Archived',
			BYPASS: 'Bypassed',
		}
		return labels[action] || action
	}

	const getResultIcon = (result: string) => {
		switch (result) {
			case 'SUCCESS':
				return <CheckCircleIcon className="h-5 w-5 text-green-500" />
			case 'FAILURE':
				return <XCircleIcon className="h-5 w-5 text-red-500" />
			case 'SKIPPED':
				return <SkipForwardIcon className="h-5 w-5 text-yellow-500" />
			default:
				return <ClockIcon className="h-5 w-5 text-gray-500" />
		}
	}

	const getResultBadgeStyle = (result: string) => {
		switch (result) {
			case 'SUCCESS':
				return 'bg-green-100 text-green-800'
			case 'FAILURE':
				return 'bg-red-100 text-red-800'
			case 'SKIPPED':
				return 'bg-yellow-100 text-yellow-800'
			default:
				return 'bg-gray-100 text-gray-800'
		}
	}

	const getActionColor = (action: string) => {
		switch (action) {
			case 'APPROVE':
				return 'border-green-500'
			case 'REJECT':
				return 'border-red-500'
			case 'PRINT':
				return 'border-blue-500'
			case 'COLLECT':
				return 'border-emerald-500'
			case 'NOTIFY':
				return 'border-purple-500'
			case 'ARCHIVE':
				return 'border-slate-500'
			case 'BYPASS':
				return 'border-orange-500'
			default:
				return 'border-gray-500'
		}
	}

	const getStatusBadgeStyle = (status: string) => {
		switch (status) {
			case 'PRINTED':
				return 'bg-green-100 text-green-800'
			case 'REJECTED':
				return 'bg-red-100 text-red-800'
			case 'INPROGRESS':
				return 'bg-orange-100 text-orange-800'
			case 'BYPASSED':
				return 'bg-blue-100 text-blue-800'
			default:
				return 'bg-gray-100 text-gray-800'
		}
	}

	return (
		<div className="container mx-auto px-4 py-8">
			{/* Header */}
			<div className="mb-6 flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button variant="outline" size="sm" asChild>
						<Link to={`/admin/participants/${participant.id}`}>
							<ArrowLeft className="h-4 w-4" />
						</Link>
					</Button>
					<h1 className="text-2xl font-bold">
						{participant.firstName} {participant.familyName}
						<span className="mx-2 text-base text-muted-foreground">•</span>
						<span className="text-base font-normal text-muted-foreground">
							{participant.registrationCode}
						</span>
						<span className="mx-2 text-base text-muted-foreground">•</span>
						<span className="text-base font-normal text-muted-foreground">
							{participant.organization}
						</span>
					</h1>
				</div>
				<Badge className={getStatusBadgeStyle(participant.status)}>
					{participant.status}
				</Badge>
			</div>

			{/* Summary Card */}
			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<HistoryIcon className="h-5 w-5" />
						Approval History
					</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-1 gap-4 sm:grid-cols-4">
						<div>
							<dt className="text-sm font-medium text-muted-foreground">
								Event
							</dt>
							<dd className="mt-1">{participant.event.name}</dd>
						</div>
						<div>
							<dt className="text-sm font-medium text-muted-foreground">
								Participant Type
							</dt>
							<dd className="mt-1">{participant.participantType.name}</dd>
						</div>
						<div>
							<dt className="text-sm font-medium text-muted-foreground">
								Submitted
							</dt>
							<dd className="mt-1">
								{format(new Date(participant.createdAt), 'MMM d, yyyy HH:mm')}
							</dd>
						</div>
						<div>
							<dt className="text-sm font-medium text-muted-foreground">
								Current Step
							</dt>
							<dd className="mt-1">
								<span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-700/10">
									{participant.step.role.name === 'reviewer'
										? 'Focal Person'
										: participant.step.role.name}
								</span>
							</dd>
						</div>
					</dl>
				</CardContent>
			</Card>

			{/* Timeline */}
			<Card>
				<CardHeader>
					<CardTitle>Timeline</CardTitle>
				</CardHeader>
				<CardContent>
					{participant.approvals.length === 0 ? (
						<div className="py-8 text-center text-muted-foreground">
							<ClockIcon className="mx-auto h-12 w-12 text-gray-300" />
							<p className="mt-2">No approval actions yet</p>
						</div>
					) : (
						<div className="relative">
							{/* Vertical line */}
							<div className="absolute left-6 top-0 h-full w-0.5 bg-gray-200" />

							<div className="space-y-6">
								{participant.approvals.map((approval, index) => {
									const isBypass = approval.action === 'BYPASS'
									const isAdminReject = approval.remarks?.includes('Rejected by administrator')
									const displayName = isBypass
										? 'Admin Bypass'
										: isAdminReject
											? 'Admin Reject'
											: approval.step.name
									const displayAction = getActionLabel(approval.action)

									return (
									<div key={approval.id} className="relative flex gap-4">
										{/* Icon */}
										<div
											className={`relative z-10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 bg-white ${getActionColor(displayAction)}`}
										>
											{getResultIcon(approval.result)}
										</div>

										{/* Content */}
										<div className="flex-1 pb-6">
											<div className="rounded-lg border bg-card p-4">
												<div className="mb-2 flex items-center justify-between">
													<div className="flex items-center gap-2">
														<h3 className="font-semibold">
															{displayName}
														</h3>
														<Badge variant="outline">
															{displayAction}
														</Badge>
													</div>
													<Badge className={getResultBadgeStyle(approval.result)}>
														{approval.result}
													</Badge>
												</div>

												<div className="mb-2 flex items-center gap-4 text-sm text-muted-foreground">
													<div className="flex items-center gap-1">
														<UserIcon className="h-4 w-4" />
														<span>{getApproverDisplay(approval)}</span>
													</div>
													<Separator orientation="vertical" className="h-4" />
													<div className="flex items-center gap-1">
														<ClockIcon className="h-4 w-4" />
														<span>
															{format(
																new Date(approval.createdAt),
																'MMM d, yyyy HH:mm:ss',
															)}
														</span>
													</div>
													<Separator orientation="vertical" className="h-4" />
													<div>
														Role:{' '}
														<span className="font-medium">
															{isBypass || isAdminReject
																? 'Admin'
																: isSystemStep(approval.step.name)
																	? 'System'
																	: approval.step.role.name === 'reviewer'
																		? 'Focal Person'
																		: approval.step.role.name}
														</span>
													</div>
												</div>

												{approval.remarks && (
													<div className="mt-3 rounded-md bg-muted p-3">
														<p className="text-sm">{approval.remarks}</p>
													</div>
												)}
											</div>
										</div>
									</div>
								)})}


								{/* Next Step - only show if status is INPROGRESS */}
								{participant.status === 'INPROGRESS' && (
									<div className="relative flex gap-4">
										{/* Icon */}
										<div className="relative z-10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 border-dashed border-blue-400 bg-blue-50">
											<CircleDashedIcon className="h-5 w-5 text-blue-500" />
										</div>

										{/* Content */}
										<div className="flex-1">
											<div className="rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 p-4">
												<div className="mb-2 flex items-center justify-between">
													<div className="flex items-center gap-2">
														<h3 className="font-semibold text-blue-700">
															{participant.step.name}
														</h3>
														<Badge
															variant="outline"
															className="border-blue-300 text-blue-600"
														>
															{participant.step.action}
														</Badge>
													</div>
													<Badge className="bg-blue-100 text-blue-700">
														PENDING
													</Badge>
												</div>

												<div className="flex items-center gap-4 text-sm text-blue-600">
													<div>
														Waiting for:{' '}
														<span className="font-medium">
															{participant.step.role.name === 'reviewer'
																? 'Focal Person'
																: participant.step.role.name}
														</span>
													</div>
												</div>
											</div>
										</div>
									</div>
								)}
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<Card className="mt-6">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<MailIcon className="h-5 w-5" />
						Emails
					</CardTitle>
				</CardHeader>
				<CardContent>
					{participant.emailLogs.length === 0 ? (
						<p className="py-6 text-center text-sm text-muted-foreground">
							No emails have been sent for this request yet.
						</p>
					) : (
						<ul className="divide-y">
							{participant.emailLogs.map(email => (
								<li key={email.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-medium">
												{EMAIL_TEMPLATE_DEFAULTS[email.trigger].label}
											</span>
											<Badge className={emailStatusStyles[email.status]}>{email.status}</Badge>
										</div>
										<p className="mt-1 break-all text-sm text-muted-foreground">
											To {email.recipient} •{' '}
											{format(new Date(email.createdAt), 'MMM d, yyyy HH:mm')}
											{email.triggeredBy ? ` • by ${email.triggeredBy.username}` : ''}
										</p>
										{email.status === 'FAILED' && email.error && (
											<p className="mt-1 break-all text-sm text-destructive">{email.error}</p>
										)}
										<details className="mt-2 text-sm">
											<summary className="cursor-pointer text-muted-foreground">
												{email.subject}
											</summary>
											<pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3 font-sans">
												{email.body}
											</pre>
										</details>
									</div>
									<Form method="POST" className="shrink-0">
										<AuthenticityTokenInput />
										<input type="hidden" name="emailLogId" value={email.id} />
										<Button type="submit" variant="outline" size="sm" disabled={resendingId === email.id}>
											<RotateCwIcon className="mr-2 h-4 w-4" />
											{resendingId === email.id ? 'Resending...' : 'Resend'}
										</Button>
									</Form>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
