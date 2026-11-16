import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useLoaderData,
	useNavigate,
	useParams,
} from '@remix-run/react'
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
import { auditRequest } from '~/utils/audit.server'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse, useIsPending } from '~/utils/misc'
import {
	StepLifecycleError,
	getStepUsage,
	removeBlocker,
	removeStep,
} from '~/utils/step-lifecycle.server'
import { redirectWithToast } from '~/utils/toast.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const step = await prisma.step.findFirst({
		where: {
			id: params.stepId,
			workflowId: params.workflowId,
			retiredAt: null,
			workflow: { event: getTenantFilter(user) },
		},
		select: {
			id: true,
			name: true,
			order: true,
			nextStepId: true,
			isRejectionTarget: true,
			isBypassTarget: true,
		},
	})
	invariantResponse(step, 'Step not found', { status: 404 })

	const [usage, predecessors, next] = await Promise.all([
		getStepUsage(step.id),
		prisma.step.findMany({
			where: {
				workflowId: params.workflowId,
				nextStepId: step.id,
				retiredAt: null,
			},
			select: { name: true },
		}),
		step.nextStepId
			? prisma.step.findUnique({
					where: { id: step.nextStepId },
					select: { name: true },
				})
			: null,
	])

	return json({
		step,
		usage,
		predecessors: predecessors.map(p => p.name),
		nextName: next?.name ?? null,
		blocker: removeBlocker(step, usage),
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const { eventId, workflowId, stepId } = params
	try {
		const result = await removeStep({
			stepId: stepId!,
			tenantFilter: getTenantFilter(user),
		})
		const retired = result.outcome === 'retired'
		await auditRequest({
			request,
			action: retired ? AuditAction.UPDATE : AuditAction.DELETE,
			entityType: AuditEntityType.STEP,
			entityId: result.step.id,
			description: `${retired ? 'Retired' : 'Deleted'} step "${result.step.name}"`,
			userId: user.id,
			tenantId: result.step.tenantId,
			metadata: result,
		})
		return redirectWithToast(
			`/admin/events/${eventId}/workflows/${workflowId}/steps`,
			{
				type: 'success',
				title: retired ? 'Step Retired' : 'Step Deleted',
				description: retired
					? `"${result.step.name}" is out of the workflow. Its history is kept.`
					: `"${result.step.name}" was deleted.`,
			},
		)
	} catch (error) {
		if (error instanceof StepLifecycleError)
			return json({ error: error.message }, { status: 400 })
		throw error
	}
}

export default function RemoveStepRoute() {
	const { step, usage, predecessors, nextName, blocker } =
		useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const { eventId, workflowId } = useParams()
	const navigate = useNavigate()
	const isPending = useIsPending()
	const stepsUrl = `/admin/events/${eventId}/workflows/${workflowId}/steps`
	const willRetire = usage.approvals > 0

	return (
		<Dialog open onOpenChange={open => !open && navigate(stepsUrl)}>
			<DialogContent
				className="sm:max-w-[480px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Remove “{step.name}”</DialogTitle>
					<DialogDescription>
						{willRetire
							? `${usage.approvals} approval${usage.approvals === 1 ? ' was' : 's were'} recorded at this step, so it will be retired: taken out of the workflow but kept so that history still reads correctly. You can restore it later.`
							: 'Nothing has happened at this step yet, so it will be deleted.'}
					</DialogDescription>
				</DialogHeader>

				{blocker ? (
					<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
						<p className="font-medium text-destructive">Can’t remove yet</p>
						<p className="mt-1 text-muted-foreground">{blocker}</p>
						{usage.participants > 0 && (
							<Button asChild size="sm" variant="outline" className="mt-3">
								<Link to={`${stepsUrl}/move?from=${step.id}`}>
									Move participants
								</Link>
							</Button>
						)}
					</div>
				) : (
					<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
						{predecessors.length > 0 && (
							<li>
								{predecessors.join(', ')} will lead to{' '}
								<span className="font-medium text-foreground">
									{nextName ?? 'nothing (it becomes the final step)'}
								</span>{' '}
								instead.
							</li>
						)}
						{willRetire && usage.accessGrants > 0 && (
							<li>
								{usage.accessGrants} access grant
								{usage.accessGrants === 1 ? '' : 's'} to this step will be
								removed.
							</li>
						)}
					</ul>
				)}

				<Form method="POST">
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<ErrorList errors={actionData?.error ? [actionData.error] : []} />
					<DialogFooter>
						<Button type="button" variant="outline" asChild>
							<Link to={stepsUrl}>Cancel</Link>
						</Button>
						<StatusButton
							type="submit"
							variant="destructive"
							disabled={isPending || Boolean(blocker)}
							status={isPending ? 'pending' : 'idle'}
						>
							{willRetire ? 'Retire Step' : 'Delete Step'}
						</StatusButton>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
