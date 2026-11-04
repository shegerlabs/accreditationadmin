import { getFormProps, useForm } from '@conform-to/react'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Form, Link, useLoaderData, useNavigation } from '@remix-run/react'
import { AlertTriangle, CalendarDays, RotateCcw } from 'lucide-react'
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
import { auditRequest } from '~/utils/audit.server'
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
			deletedAt: true,
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

	// Only deleted events can be restored
	if (!event.deletedAt) {
		throw json(
			{ message: 'Only deleted events can be restored' },
			{ status: 400 },
		)
	}

	// Tenant admins can only restore their own tenant's events
	if (!user.isGlobalAdmin && event.tenantId !== user.tenantId) {
		throw json({ message: 'Access denied' }, { status: 403 })
	}

	return json({ event })
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
		select: { tenantId: true, deletedAt: true, name: true },
	})
	invariantResponse(event, 'Event not found', { status: 404 })

	if (!event.deletedAt) {
		throw json(
			{ message: 'Only deleted events can be restored' },
			{ status: 400 },
		)
	}

	if (!user.isGlobalAdmin && event.tenantId !== user.tenantId) {
		throw json({ message: 'Access denied' }, { status: 403 })
	}

	const restoredEvent = await prisma.event.update({
		where: { id: eventId },
		data: { deletedAt: null },
	})

	await auditRequest({
		request,
		action: AuditAction.UPDATE,
		entityType: AuditEntityType.EVENT,
		entityId: eventId,
		description: 'Event restored from deletion',
		userId: user.id,
		metadata: {
			event: restoredEvent,
		},
	})

	return redirectWithToast(`/admin/events/${eventId}`, {
		type: 'success',
		title: 'Event Restored',
		description: `"${event.name}" has been restored and is available again.`,
	})
}

export default function RestoreEventPage() {
	const { event } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const isSubmitting = navigation.state === 'submitting'

	const [form] = useForm({
		id: 'restore-event-form',
	})

	return (
		<div>
			{/* Status Alert with Actions */}
			<Alert variant="warning" className="mb-6">
				<AlertTriangle className="h-5 w-5" />
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<AlertTitle>Restore Deleted Event</AlertTitle>
						<AlertDescription>
							This event was deleted on{' '}
							{new Date(event.deletedAt!).toLocaleDateString()}. Restoring it
							will make it available again.
						</AlertDescription>
					</div>
					<div className="flex items-center gap-2">
						<Button asChild variant="outline">
							<Link to="/admin/events/deleted">Cancel</Link>
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
								<RotateCcw className="mr-2 h-4 w-4" />
								Restore
							</StatusButton>
						</Form>
					</div>
				</div>
			</Alert>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-2xl">
						<RotateCcw className="h-6 w-6" />
						Restore Event
					</CardTitle>
					<CardDescription className="mt-2">
						You are about to restore <strong>{event.name}</strong>. Please
						review the information below before proceeding.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-6">
					{/* What happens when restored */}
					<div className="rounded-lg border bg-muted/50 p-4">
						<h3 className="mb-3 font-semibold">
							What happens when you restore the event?
						</h3>
						<ul className="ml-4 list-disc space-y-2 text-sm text-muted-foreground">
							<li>
								The event will be <strong>available</strong> again in the events
								list
							</li>
							<li>
								All associated data (participants, workflows, invitations) will
								be accessible
							</li>
							<li>
								The event will retain its previous status ({event.status})
							</li>
							<li>You can delete the event again if needed</li>
						</ul>
					</div>

					{/* Event Summary */}
					<div>
						<h3 className="mb-3 font-semibold">Event Summary</h3>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="rounded-lg border p-3">
								<div className="text-sm text-muted-foreground">Event Name</div>
								<div className="flex items-center gap-2 font-medium">
									<CalendarDays className="h-4 w-4" />
									{event.name}
								</div>
							</div>
							<div className="rounded-lg border p-3">
								<div className="text-sm text-muted-foreground">Status</div>
								<div className="font-medium">{event.status}</div>
							</div>
							<div className="rounded-lg border p-3">
								<div className="text-sm text-muted-foreground">Event Dates</div>
								<div className="font-medium">
									{new Date(event.startDate).toLocaleDateString()} -{' '}
									{new Date(event.endDate).toLocaleDateString()}
								</div>
							</div>
							<div className="rounded-lg border p-3">
								<div className="text-sm text-muted-foreground">Deleted On</div>
								<div className="font-medium text-red-600">
									{new Date(event.deletedAt!).toLocaleDateString()}
								</div>
							</div>
						</div>
					</div>

					{/* Statistics */}
					<div>
						<h3 className="mb-3 font-semibold">Associated Data</h3>
						<div className="grid gap-4 sm:grid-cols-3">
							<div className="rounded-lg border p-3">
								<div className="text-sm text-muted-foreground">Participants</div>
								<div className="text-2xl font-bold">
									{event._count.participants}
								</div>
							</div>
							<div className="rounded-lg border p-3">
								<div className="text-sm text-muted-foreground">Workflows</div>
								<div className="text-2xl font-bold">{event._count.workflows}</div>
							</div>
							<div className="rounded-lg border p-3">
								<div className="text-sm text-muted-foreground">Invitations</div>
								<div className="text-2xl font-bold">
									{event._count.invitations}
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
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
						redirectUrl="/admin/events/deleted"
						errorCode={404}
					/>
				),
				400: () => (
					<ErrorDisplay
						title="Cannot Restore"
						message="This event cannot be restored. Only deleted events can be restored."
						redirectUrl="/admin/events"
						errorCode={400}
					/>
				),
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You don't have permission to restore this event."
						redirectUrl="/admin/events/deleted"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
