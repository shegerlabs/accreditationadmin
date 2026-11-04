import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import { Form, useActionData, useLoaderData, useNavigate, useParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { ErrorList } from '~/components/forms'
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
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { WorkflowDeleteSchema } from './__workflow-editor'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(currentUser)

	const { eventId, workflowId } = params

	const event = await prisma.event.findFirst({
		select: { id: true, tenantId: true, name: true },
		where: {
			id: eventId,
			...tenantFilter,
		},
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	const workflow = await prisma.workflow.findFirst({
		select: {
			id: true,
			name: true,
			eventId: true,
			steps: {
				select: { id: true },
			},
		},
		where: {
			id: workflowId,
			event: tenantFilter,
		},
	})

	invariantResponse(workflow, 'Workflow not found', { status: 404 })

	// Count access grants that will be deleted
	const stepIds = workflow.steps.map(s => s.id)
	let accessGrantCount = 0
	let affectedUserCount = 0
	let participantCount = 0

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

		// Count participants linked to steps in this workflow
		participantCount = await prisma.participant.count({
			where: {
				stepId: { in: stepIds },
			},
		})
	}

	return json({
		event,
		workflow: { id: workflow.id, name: workflow.name, eventId: workflow.eventId },
		accessGrantCount,
		affectedUserCount,
		participantCount,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(currentUser)

	const { workflowId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = parseWithZod(formData, { schema: WorkflowDeleteSchema })

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	// Check if there are participants linked to this workflow's steps
	const workflow = await prisma.workflow.findFirst({
		where: {
			id: workflowId,
			event: tenantFilter,
		},
		select: {
			eventId: true,
			steps: {
				select: { id: true },
			},
		},
	})

	if (!workflow) {
		return json(
			{ result: submission.reply({ formErrors: ['Workflow not found'] }) },
			{ status: 404 },
		)
	}

	const stepIds = workflow.steps.map(s => s.id)
	if (stepIds.length > 0) {
		const participantCount = await prisma.participant.count({
			where: { stepId: { in: stepIds } },
		})

		if (participantCount > 0) {
			return json(
				{
					result: submission.reply({
						formErrors: [
							`Cannot delete workflow: ${participantCount} participant${participantCount !== 1 ? 's are' : ' is'} currently registered in this workflow.`,
						],
					}),
				},
				{ status: 400 },
			)
		}
	}

	await prisma.workflow.delete({
		where: { id: workflowId },
	})

	return redirectWithToast(`/admin/events/${workflow.eventId}/workflows`, {
		type: 'success',
		title: 'Workflow Deleted',
		description: 'Workflow deleted successfully.',
	})
}

export default function DeleteWorkflowRoute() {
	const { event, workflow, accessGrantCount, affectedUserCount, participantCount } =
		useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const { eventId } = useParams()
	const navigate = useNavigate()
	const isPending = useIsPending()
	const cancelUrl = `/admin/events/${eventId}/workflows`

	const [form] = useForm({
		id: 'delete-workflow',
		lastResult: actionData?.result,
	})

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			navigate(cancelUrl)
		}
	}

	return (
		<Dialog open onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-[425px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Delete Workflow</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete "{workflow.name}"? This will also
						delete all steps associated with it. This action cannot be undone.
					</DialogDescription>
				</DialogHeader>

				{participantCount > 0 && (
					<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
						<p className="font-medium text-destructive">Cannot Delete: Participants Registered</p>
						<p className="mt-1 text-muted-foreground">
							This workflow has{' '}
							<span className="font-medium text-foreground">{participantCount}</span> participant
							{participantCount !== 1 ? 's' : ''} registered. You must remove all participants
							before deleting this workflow.
						</p>
					</div>
				)}

				{accessGrantCount > 0 && participantCount === 0 && (
					<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
						<p className="font-medium text-destructive">Warning: Access Grants Will Be Removed</p>
						<p className="mt-1 text-muted-foreground">
							Deleting this workflow will also remove{' '}
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
					<input type="hidden" name="id" value={workflow.id} />

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
							Delete Workflow
						</StatusButton>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
