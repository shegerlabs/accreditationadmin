import { getFormProps, useForm } from '@conform-to/react'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Form, Link, useLoaderData, useNavigation } from '@remix-run/react'
import {
	AlertTriangle,
	CheckCircle2,
	Globe,
	RefreshCw,
	Users,
	XCircle,
} from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { StatusButton } from '~/components/ui/status-button'
import { requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const { eventId } = params

	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			name: true,
			description: true,
			status: true,
			startDate: true,
			endDate: true,
			tenantId: true,
			_count: {
				select: {
					participants: true,
					invitations: true,
					workflows: true,
				},
			},
		},
	})

	invariantResponse(event, 'Not Found', { status: 404 })

	// Only COMPLETED events can be reopened
	if (event.status !== 'COMPLETED') {
		throw json(
			{ message: 'Only completed events can be reopened' },
			{ status: 400 },
		)
	}

	// Tenant admins can only reopen their own tenant's events
	if (!user.isGlobalAdmin && event.tenantId !== user.tenantId) {
		throw json({ message: 'Access denied' }, { status: 403 })
	}

	// Count participants by workflow status
	// Participants at a final step (no next step) are considered completed
	const pendingParticipants = await prisma.participant.count({
		where: {
			eventId,
			step: {
				nextStepId: { not: null },
			},
		},
	})

	const completedParticipants = await prisma.participant.count({
		where: {
			eventId,
			step: {
				nextStepId: null,
			},
		},
	})

	// Check if event dates are still valid
	const now = new Date()
	const isExpired = new Date(event.endDate) < now

	return json({
		event,
		stats: {
			totalParticipants: event._count.participants,
			pendingParticipants,
			completedParticipants,
			invitations: event._count.invitations,
		},
		isExpired,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const { eventId } = params
	invariantResponse(eventId, 'Event ID required')

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: { tenantId: true, status: true, name: true },
	})
	invariantResponse(event, 'Event not found', { status: 404 })

	if (event.status !== 'COMPLETED') {
		throw json(
			{ message: 'Only completed events can be reopened' },
			{ status: 400 },
		)
	}

	if (!user.isGlobalAdmin && event.tenantId !== user.tenantId) {
		throw json({ message: 'Access denied' }, { status: 403 })
	}

	await prisma.event.update({
		where: { id: eventId },
		data: { status: 'PUBLISHED' },
	})

	return redirectWithToast(`/admin/events/${eventId}`, {
		type: 'success',
		title: 'Event Reopened',
		description: `"${event.name}" is now live again and accepting registrations.`,
	})
}

export default function ReopenEventPage() {
	const { event, stats, isExpired } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const isSubmitting = navigation.state === 'submitting'

	const [form] = useForm({
		id: 'reopen-event-form',
	})

	return (
		<div>
			{/* Status Alert with Actions */}
			<Alert variant={isExpired ? 'destructive' : 'success'} className="mb-6">
				{isExpired ? (
					<AlertTriangle className="h-5 w-5" />
				) : (
					<CheckCircle2 className="h-5 w-5" />
				)}
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<AlertTitle>
							{isExpired ? 'Event Dates Have Passed' : 'Ready to Reopen'}
						</AlertTitle>
						<AlertDescription>
							{isExpired
								? 'Consider updating the event dates before reopening to avoid confusion.'
								: 'The event will be published again and accept new registrations.'}
						</AlertDescription>
					</div>
					<div className="flex items-center gap-2">
						<Button asChild variant="outline">
							<Link to={`/admin/events/${event.id}`}>Cancel</Link>
						</Button>
						<Form method="POST" {...getFormProps(form)}>
							<AuthenticityTokenInput />
							<HoneypotInputs />
							<StatusButton
								type="submit"
								status={isSubmitting ? 'pending' : 'idle'}
								disabled={isSubmitting}
								className="gap-2"
							>
								<RefreshCw className="mr-2 h-4 w-4" />
								Reopen
							</StatusButton>
						</Form>
					</div>
				</div>
			</Alert>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-2xl">
						<RefreshCw className="h-6 w-6" />
						Reopen Event
					</CardTitle>
					<CardDescription className="mt-2">
						You are about to reopen <strong>{event.name}</strong>. Please review
						the information below before proceeding.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-6">
					{/* What happens when reopened */}
					<div className="rounded-lg border bg-muted/50 p-4">
						<h3 className="mb-3 font-semibold">
							What happens when you reopen the event?
						</h3>
						<ul className="ml-4 list-disc space-y-2 text-sm text-muted-foreground">
							<li>
								The event will be <strong>published</strong> again and accepting
								new registrations
							</li>
							<li>All existing invitations will become active again</li>
							<li>
								Pending participants will continue through their workflows
							</li>
							<li>Previously completed participants remain unchanged</li>
							<li>You can close the event again at any time</li>
						</ul>
					</div>

					{/* Current Statistics */}
					<div>
						<h3 className="mb-3 font-semibold">Current Statistics</h3>
						<div className="grid gap-4 sm:grid-cols-2">
							<StatCard
								icon={Users}
								label="Total Participants"
								value={stats.totalParticipants}
							/>
							<StatCard
								icon={CheckCircle2}
								label="Completed Workflows"
								value={stats.completedParticipants}
								variant="success"
							/>
							<StatCard
								icon={AlertTriangle}
								label="Pending Approval"
								value={stats.pendingParticipants}
								variant={stats.pendingParticipants > 0 ? 'warning' : 'default'}
							/>
							<StatCard
								icon={Globe}
								label="Active Invitations"
								value={stats.invitations}
							/>
						</div>
					</div>

					{/* Event Summary */}
					<div>
						<h3 className="mb-3 font-semibold">Event Summary</h3>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="rounded-lg border p-3">
								<div className="text-sm text-muted-foreground">Event Dates</div>
								<div className={`font-medium ${isExpired ? 'text-red-600' : ''}`}>
									{new Date(event.startDate).toLocaleDateString()} -{' '}
									{new Date(event.endDate).toLocaleDateString()}
									{isExpired && ' (Expired)'}
								</div>
							</div>
							<div className="rounded-lg border p-3">
								<div className="text-sm text-muted-foreground">
									Current Status
								</div>
								<div className="flex items-center gap-2 font-medium text-red-600">
									<XCircle className="h-4 w-4" />
									{event.status}
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

function StatCard({
	icon: Icon,
	label,
	value,
	variant = 'default',
}: {
	icon: React.ElementType
	label: string
	value: number
	variant?: 'default' | 'success' | 'warning'
}) {
	const variantStyles = {
		default: 'text-muted-foreground',
		success: 'text-green-600',
		warning: 'text-amber-600',
	}

	return (
		<div className="rounded-lg border p-3">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Icon className={`h-4 w-4 ${variantStyles[variant]}`} />
				{label}
			</div>
			<div className={`text-2xl font-bold ${variantStyles[variant]}`}>
				{value}
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => (
					<ErrorDisplay
						title="Event Not Found"
						message="The event you're looking for does not exist."
						redirectUrl="/admin/events"
						errorCode={404}
					/>
				),
				400: () => (
					<ErrorDisplay
						title="Cannot Reopen"
						message="This event cannot be reopened. Only completed events can be reopened."
						redirectUrl="/admin/events"
						errorCode={400}
					/>
				),
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You don't have permission to reopen this event."
						redirectUrl="/admin/events"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
