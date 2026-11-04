import { getFormProps, useForm } from '@conform-to/react'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import { Form, useActionData, useLoaderData, useNavigate, useParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { StatusButton } from '~/components/ui/status-button'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { ErrorList } from '~/components/forms'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		select: { id: true, name: true },
		where: { id: eventId },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	const workflowCount = await prisma.workflow.count({
		where: { eventId },
	})

	// Get all step IDs for workflows in this event
	const steps = await prisma.step.findMany({
		where: {
			workflow: { eventId },
		},
		select: { id: true },
	})

	const stepIds = steps.map(s => s.id)

	// Count access grants that will be deleted
	let accessGrantCount = 0
	let affectedUserCount = 0
	let participantCount = 0
	let workflowsWithParticipants: { id: string; name: string; participantCount: number }[] = []

	if (stepIds.length > 0) {
		const accessGrants = await prisma.userEventAccess.findMany({
			where: {
				stepId: { in: stepIds },
			},
			select: {
				userId: true,
			},
		})
		accessGrantCount = accessGrants.length
		affectedUserCount = new Set(accessGrants.map(a => a.userId)).size

		// Count participants linked to steps in these workflows
		participantCount = await prisma.participant.count({
			where: {
				stepId: { in: stepIds },
			},
		})

		// Get workflows with participants
		if (participantCount > 0) {
			const workflows = await prisma.workflow.findMany({
				where: { eventId },
				select: {
					id: true,
					name: true,
					steps: {
						select: {
							_count: {
								select: { participants: true },
							},
						},
					},
				},
			})

			workflowsWithParticipants = workflows
				.map(w => ({
					id: w.id,
					name: w.name,
					participantCount: w.steps.reduce((sum, s) => sum + s._count.participants, 0),
				}))
				.filter(w => w.participantCount > 0)
		}
	}

	return json({ event, workflowCount, accessGrantCount, affectedUserCount, participantCount, workflowsWithParticipants })
}

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	// Check if there are participants linked to any workflow's steps
	const steps = await prisma.step.findMany({
		where: {
			workflow: { eventId },
		},
		select: { id: true },
	})

	const stepIds = steps.map(s => s.id)
	if (stepIds.length > 0) {
		const participantCount = await prisma.participant.count({
			where: { stepId: { in: stepIds } },
		})

		if (participantCount > 0) {
			return json(
				{
					result: {
						status: 'error',
						error: {
							'': [
								`Cannot remove workflows: ${participantCount} participant${participantCount !== 1 ? 's are' : ' is'} currently registered.`,
							],
						},
					},
				},
				{ status: 400 },
			)
		}
	}

	// Delete all workflows for this event (steps will cascade delete)
	const result = await prisma.workflow.deleteMany({
		where: { eventId },
	})

	return redirectWithToast(`/admin/events/${eventId}/workflows`, {
		type: 'success',
		title: 'Workflows Removed',
		description: `Successfully removed ${result.count} workflow${result.count !== 1 ? 's' : ''}.`,
	})
}

export default function RemoveAllWorkflowsRoute() {
	const { event, workflowCount, accessGrantCount, affectedUserCount, participantCount, workflowsWithParticipants } =
		useLoaderData<typeof loader>()
	const actionData = useActionData<{ result: any }>()
	const { eventId } = useParams()
	const navigate = useNavigate()
	const isPending = useIsPending()
	const cancelUrl = `/admin/events/${eventId}/workflows`

	const [form] = useForm({
		id: 'remove-all-workflows',
		lastResult: actionData?.result,
	})

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			navigate(cancelUrl)
		}
	}

	if (workflowCount === 0) {
		return (
			<Dialog open onOpenChange={handleOpenChange}>
				<DialogContent
					className="sm:max-w-[425px]"
					onInteractOutside={e => e.preventDefault()}
				>
					<DialogHeader>
						<DialogTitle>Remove All Workflows</DialogTitle>
						<DialogDescription>
							There are no workflows to remove for this event.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" asChild>
							<a href={cancelUrl}>Close</a>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		)
	}

	return (
		<Dialog open onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-[425px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Remove All Workflows</DialogTitle>
					<DialogDescription>
						Are you sure you want to remove all {workflowCount} workflow
						{workflowCount !== 1 ? 's' : ''} from "{event.name}"? This will also
						delete all steps associated with them. This action cannot be undone.
					</DialogDescription>
				</DialogHeader>

				{participantCount > 0 && (
					<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
						<p className="font-medium text-destructive">Cannot Remove: Participants Registered</p>
						<p className="mt-1 text-muted-foreground">
							The following workflows have participants registered:
						</p>
						<ul className="mt-2 list-disc pl-5 text-muted-foreground">
							{workflowsWithParticipants.map(w => (
								<li key={w.id}>
									<span className="font-medium text-foreground">{w.name}</span>
									{' - '}
									{w.participantCount} participant{w.participantCount !== 1 ? 's' : ''}
								</li>
							))}
						</ul>
						<p className="mt-2 text-muted-foreground">
							You must remove all participants before removing the workflows.
						</p>
					</div>
				)}

				{accessGrantCount > 0 && participantCount === 0 && (
					<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
						<p className="font-medium text-destructive">Warning: Access Grants Will Be Removed</p>
						<p className="mt-1 text-muted-foreground">
							Removing all workflows will also remove{' '}
							<span className="font-medium text-foreground">{accessGrantCount}</span> access grant
							{accessGrantCount !== 1 ? 's' : ''} for{' '}
							<span className="font-medium text-foreground">{affectedUserCount}</span> user
							{affectedUserCount !== 1 ? 's' : ''}.
						</p>
					</div>
				)}

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<ErrorList id={form.errorId} errors={form.errors} />

					<DialogFooter>
						<Button type="button" variant="outline" asChild>
							<a href={cancelUrl}>Cancel</a>
						</Button>
						<StatusButton
							type="submit"
							name="intent"
							value="delete"
							variant="destructive"
							disabled={isPending || participantCount > 0}
							status={isPending ? 'pending' : form.status ?? 'idle'}
						>
							Remove {workflowCount} Workflow{workflowCount !== 1 ? 's' : ''}
						</StatusButton>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
