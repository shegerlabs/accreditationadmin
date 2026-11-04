import { getFormProps, useForm } from '@conform-to/react'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import {
	Form,
	Link,
	useLoaderData,
	useNavigation,
} from '@remix-run/react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
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
			workflows: {
				include: {
					participantType: true,
				},
			},
			invitations: {
				include: {
					invitationConstraints: {
						include: {
							participantType: true,
						},
					},
				},
			},
			restrictions: true,
			templates: true,
		},
	})

	invariantResponse(event, 'Not Found', { status: 404 })

	// Only DRAFT events can be published
	if (event.status !== 'DRAFT') {
		throw json(
			{ message: 'Only draft events can be published' },
			{ status: 400 },
		)
	}

	// Tenant admins can only publish their own tenant's events
	if (!user.isGlobalAdmin && event.tenantId !== user.tenantId) {
		throw json({ message: 'Access denied' }, { status: 403 })
	}

	// Calculate readiness checks
	const hasWorkflows = event.workflows.length > 0
	const hasInvitations = event.invitations.length > 0
	const hasRestrictions = event.restrictions.length > 0
	const hasTemplates = event.templates.length > 0

	// Get participant types with workflows
	const participantTypesWithWorkflows = event.workflows.map(
		w => w.participantType?.name ?? 'Unknown',
	)

	// Calculate total invitation quota
	const totalQuota = event.invitations.reduce((sum: number, inv) => {
		return (
			sum +
			inv.invitationConstraints.reduce(
				(cSum: number, c) => cSum + (c.quota ?? 0),
				0,
			)
		)
	}, 0)

	return json({
		event,
		readiness: {
			hasWorkflows,
			hasInvitations,
			hasRestrictions,
			hasTemplates,
			participantTypesWithWorkflows,
			totalQuota,
			invitationCount: event.invitations.length,
			workflowCount: event.workflows.length,
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

	// Validate event exists and is in DRAFT status
	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: { tenantId: true, status: true, name: true },
	})
	invariantResponse(event, 'Event not found', { status: 404 })

	if (event.status !== 'DRAFT') {
		throw json(
			{ message: 'Only draft events can be published' },
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
		title: 'Event Published',
		description: `"${event.name}" is now live and accepting registrations.`,
	})
}

export default function PublishEventPage() {
	const { event, readiness } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const isSubmitting = navigation.state === 'submitting'

	const [form] = useForm({
		id: 'publish-event-form',
	})

	const allReady = readiness.hasWorkflows

	return (
		<div>
			{/* Status Alert with Actions */}
			<Alert variant={allReady ? 'success' : 'destructive'} className="mb-6">
				{allReady ? (
					<CheckCircle2 className="h-5 w-5" />
				) : (
					<AlertTriangle className="h-5 w-5" />
				)}
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<AlertTitle>
							{allReady ? 'Ready to Publish' : 'Cannot Publish'}
						</AlertTitle>
						<AlertDescription>
							{allReady
								? 'All required items are configured. You can publish this event.'
								: 'Required items must be configured before publishing. Please complete the items marked as required below.'}
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
								disabled={isSubmitting || !allReady}
								className="gap-2"
							>
								Publish
							</StatusButton>
						</Form>
					</div>
				</div>
			</Alert>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-2xl">
						Publish Event
					</CardTitle>
					<CardDescription className="mt-2">
						You are about to publish <strong>{event.name}</strong>. Please
						review the information below before proceeding.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-6">
					{/* What happens when published */}
					<div className="rounded-lg border bg-muted/50 p-4">
						<h3 className="mb-3 font-semibold">
							What happens when you publish?
						</h3>
						<ul className="ml-4 list-disc space-y-2 text-sm text-muted-foreground">
							<li>
								The event becomes <strong>publicly accessible</strong> for
								participant registration
							</li>
							<li>
								Invitations with valid codes can be used to register participants
							</li>
							<li>
								Workflows will be activated and participants will flow through
								the defined approval steps
							</li>
							<li>
								Email notifications may be sent based on workflow configurations
							</li>
							<li>
								You can still edit event details, workflows, and invitations
								after publishing
							</li>
						</ul>
					</div>

					{/* Readiness Checklist */}
					<div>
						<h3 className="mb-3 font-semibold">Readiness Checklist</h3>
						<div className="space-y-3">
							<ReadinessItem
								ready={readiness.hasWorkflows}
								label="Workflows configured"
								description={
									readiness.hasWorkflows
										? `${readiness.workflowCount} workflow(s) for: ${readiness.participantTypesWithWorkflows.join(', ')}`
										: 'No workflows defined. Participants will not have an approval flow.'
								}
								href={`/admin/events/${event.id}/workflows`}
								required
							/>
							<ReadinessItem
								ready={readiness.hasInvitations}
								label="Invitations created"
								description={
									readiness.hasInvitations
										? `${readiness.invitationCount} invitation(s) with total quota of ${readiness.totalQuota} participants`
										: 'No invitations created. Organizations cannot register without invitations.'
								}
								href={`/admin/events/${event.id}/invitations`}
							/>
							<ReadinessItem
								ready={readiness.hasRestrictions}
								label="Restrictions configured"
								description={
									readiness.hasRestrictions
										? 'Quota restrictions and constraints are in place'
										: 'Quota restrictions and constraints are not in place'
								}
								href={`/admin/events/${event.id}/restrictions`}
							/>
							<ReadinessItem
								ready={readiness.hasTemplates}
								label="Badge templates uploaded"
								description={
									readiness.hasTemplates
										? 'Badge templates are ready for printing'
										: 'No templates. Badges cannot be generated until templates are added.'
								}
								href={`/admin/events/${event.id}/templates`}
							/>
						</div>
					</div>

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
								<div className="font-medium">{event.status}</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

function ReadinessItem({
	ready,
	label,
	description,
	required,
	href,
}: {
	ready: boolean
	label: string
	description: string
	required?: boolean
	href?: string
}) {
	const content = (
		<>
			<div
				className={`mt-0.5 rounded-full p-1 ${
					ready
						? 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400'
						: required
							? 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400'
							: 'bg-gray-100 text-gray-400 dark:bg-gray-800'
				}`}
			>
				{ready ? (
					<CheckCircle2 className="h-4 w-4" />
				) : (
					<AlertTriangle className="h-4 w-4" />
				)}
			</div>
			<div className="flex-1">
				<div className="flex items-center gap-2">
					<span className="font-medium">{label}</span>
					{required && (
						<span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
							Required
						</span>
					)}
				</div>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
		</>
	)

	if (href) {
		return (
			<Link
				to={href}
				className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
			>
				{content}
			</Link>
		)
	}

	return (
		<div className="flex items-start gap-3 rounded-lg border p-3">
			{content}
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
						title="Cannot Publish"
						message="This event cannot be published. It may already be published or completed."
						redirectUrl="/admin/events"
						errorCode={400}
					/>
				),
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You don't have permission to publish this event."
						redirectUrl="/admin/events"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
