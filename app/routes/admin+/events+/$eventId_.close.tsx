import { getFormProps, useForm } from '@conform-to/react'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Form, Link, useLoaderData, useNavigation } from '@remix-run/react'
import {
	AlertTriangle,
	Ban,
	CheckCircle2,
	Lock,
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

	// Only PUBLISHED events can be closed
	if (event.status !== 'PUBLISHED') {
		throw json(
			{ message: 'Only published events can be closed' },
			{ status: 400 },
		)
	}

	// Tenant admins can only close their own tenant's events
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

	return json({
		event,
		stats: {
			totalParticipants: event._count.participants,
			pendingParticipants,
			completedParticipants,
			invitations: event._count.invitations,
		},
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

	if (event.status !== 'PUBLISHED') {
		throw json(
			{ message: 'Only published events can be closed' },
			{ status: 400 },
		)
	}

	if (!user.isGlobalAdmin && event.tenantId !== user.tenantId) {
		throw json({ message: 'Access denied' }, { status: 403 })
	}

	await prisma.event.update({
		where: { id: eventId },
		data: { status: 'COMPLETED' },
	})

	return redirectWithToast(`/admin/events/${eventId}`, {
		type: 'success',
		title: 'Event Closed',
		description: `"${event.name}" has been closed. No new registrations will be accepted.`,
	})
}

export default function CloseEventPage() {
	const { event, stats } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const isSubmitting = navigation.state === 'submitting'

	const [form] = useForm({
		id: 'close-event-form',
	})

	return (
		<div>
			{/* Status Alert with Actions */}
			<Alert variant="warning" className="mb-6">
				<AlertTriangle className="h-5 w-5" />
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<AlertTitle>Close Registration</AlertTitle>
						<AlertDescription>
							No new registrations will be accepted. Existing participants can
							still be processed. You can reopen later if needed.
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
								variant="destructive"
								status={isSubmitting ? 'pending' : 'idle'}
								disabled={isSubmitting}
								className="gap-2"
							>
								<Lock className="mr-2 h-4 w-4" />
								Close
							</StatusButton>
						</Form>
					</div>
				</div>
			</Alert>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-2xl">
						<Lock className="h-6 w-6" />
						Close Event
					</CardTitle>
					<CardDescription className="mt-2">
						You are about to close <strong>{event.name}</strong>. Please review
						the information below before proceeding.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-6">
					{/* What happens when closed */}
					<div className="rounded-lg border bg-muted/50 p-4">
						<h3 className="mb-3 font-semibold">
							What happens when you close the event?
						</h3>
						<ul className="ml-4 list-disc space-y-2 text-sm text-muted-foreground">
							<li>
								<strong>No new registrations</strong> will be accepted
							</li>
							<li>
								Existing participants can still be processed through their
								workflows
							</li>
							<li>
								Validators can continue approving/rejecting pending participants
							</li>
							<li>Badge printing and other operations remain available</li>
							<li>
								You can <strong>reopen</strong> the event later if needed
							</li>
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
								icon={Ban}
								label="Active Invitations"
								value={stats.invitations}
							/>
						</div>
					</div>

					{/* Warning if pending participants */}
					{stats.pendingParticipants > 0 && (
						<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
							<div className="flex gap-3">
								<AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
								<div>
									<h4 className="font-medium text-amber-800 dark:text-amber-200">
										Pending Participants
									</h4>
									<p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
										There are {stats.pendingParticipants} participant(s) still
										waiting for approval. They will remain in their current
										workflow step after closing.
									</p>
								</div>
							</div>
						</div>
					)}

					{/* Event Summary */}
					<div>
						<h3 className="mb-3 font-semibold">Event Summary</h3>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="rounded-lg border p-3">
								<div className="text-sm text-muted-foreground">Event Dates</div>
								<div className="font-medium">
									{new Date(event.startDate).toLocaleDateString()} -{' '}
									{new Date(event.endDate).toLocaleDateString()}
								</div>
							</div>
							<div className="rounded-lg border p-3">
								<div className="text-sm text-muted-foreground">
									Current Status
								</div>
								<div className="flex items-center gap-2 font-medium text-green-600">
									<CheckCircle2 className="h-4 w-4" />
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
						title="Cannot Close"
						message="This event cannot be closed. Only published events can be closed."
						redirectUrl="/admin/events"
						errorCode={400}
					/>
				),
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You don't have permission to close this event."
						redirectUrl="/admin/events"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
