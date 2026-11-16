import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import {
	Form,
	Link,
	useLoaderData,
	useNavigate,
	useParams,
} from '@remix-run/react'
import { ArchiveRestore } from 'lucide-react'
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
import { auditRequest } from '~/utils/audit.server'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { useIsPending } from '~/utils/misc'
import {
	StepLifecycleError,
	previewRestore,
	restoreStep,
} from '~/utils/step-lifecycle.server'
import { redirectWithToast } from '~/utils/toast.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const stepsUrl = `/admin/events/${params.eventId}/workflows/${params.workflowId}/steps`
	try {
		return json(
			await previewRestore({
				stepId: params.stepId!,
				tenantFilter: getTenantFilter(user),
			}),
		)
	} catch (error) {
		if (!(error instanceof StepLifecycleError)) throw error
		return redirectWithToast(stepsUrl, {
			type: 'error',
			title: 'Could Not Restore Step',
			description: error.message,
		})
	}
}

function restoreSummary({
	step,
	relinked,
	notRelinked,
	nextStepCleared,
	accessRestored,
}: Awaited<ReturnType<typeof restoreStep>>) {
	const name = `"${step.name}"`
	const parts = [
		relinked.length > 0
			? `${relinked.join(', ')} ${relinked.length === 1 ? 'leads' : 'lead'} to ${name} again.`
			: `Nothing leads to ${name} yet. Set it as the next step of the step before it.`,
	]
	if (notRelinked.length > 0)
		parts.push(
			`${notRelinked.join(', ')} ${notRelinked.length === 1 ? 'was' : 'were'} changed since, so ${notRelinked.length === 1 ? 'it was' : 'they were'} left alone.`,
		)
	if (nextStepCleared)
		parts.push(`Its old next step is gone, so choose a new one.`)
	parts.push(
		accessRestored > 0
			? `${accessRestored} access grant${accessRestored === 1 ? '' : 's'} restored.`
			: 'Grant validators access to it under Access.',
	)
	return parts.join(' ')
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const stepsUrl = `/admin/events/${params.eventId}/workflows/${params.workflowId}/steps`
	try {
		const result = await restoreStep({
			stepId: params.stepId!,
			tenantFilter: getTenantFilter(user),
		})
		await auditRequest({
			request,
			action: AuditAction.UPDATE,
			entityType: AuditEntityType.STEP,
			entityId: result.step.id,
			description: `Restored retired step "${result.step.name}"`,
			userId: user.id,
			tenantId: result.step.tenantId,
			metadata: result,
		})
		return redirectWithToast(stepsUrl, {
			type: result.relinked.length > 0 ? 'success' : 'message',
			title: 'Step Restored',
			description: restoreSummary(result),
		})
	} catch (error) {
		if (!(error instanceof StepLifecycleError)) throw error
		return redirectWithToast(stepsUrl, {
			type: 'error',
			title: 'Could Not Restore Step',
			description: error.message,
		})
	}
}

export default function RestoreStepRoute() {
	const {
		step,
		hasSavedPlace,
		next,
		nextStepCleared,
		relink,
		notRelinked,
		access,
	} = useLoaderData<typeof loader>()
	const { eventId, workflowId } = useParams()
	const navigate = useNavigate()
	const isPending = useIsPending()
	const stepsUrl = `/admin/events/${eventId}/workflows/${workflowId}/steps`
	const name = `“${step.name}”`

	return (
		<Dialog open onOpenChange={open => !open && navigate(-1)}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>Restore {name}?</DialogTitle>
					<DialogDescription>
						The step goes back into the workflow. Nobody is moved onto it:
						participants reach it as they are approved at the step before it.
					</DialogDescription>
				</DialogHeader>

				<ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
					{relink.length > 0 ? (
						<li>
							<Strong>{relink.join(', ')}</Strong> will lead to {name} again
							{next ? (
								<>
									, and {name} to <Strong>{next}</Strong>
								</>
							) : null}
							.
						</li>
					) : (
						<li>
							Nothing will lead to {name}.{' '}
							{hasSavedPlace
								? 'Set it as the next step of the step before it afterwards.'
								: 'It was retired before positions were saved, so set it as the next step of the step before it afterwards.'}
						</li>
					)}
					{notRelinked.length > 0 && (
						<li>
							<Strong>{notRelinked.join(', ')}</Strong>{' '}
							{notRelinked.length === 1 ? 'has' : 'have'} been changed since and
							will be left as {notRelinked.length === 1 ? 'it is' : 'they are'}.
						</li>
					)}
					{nextStepCleared && (
						<li>Its old next step is gone, so choose a new one afterwards.</li>
					)}
					<li>
						{access.length > 0 ? (
							<>
								Access comes back for <Strong>{access.join(', ')}</Strong>.
							</>
						) : (
							'No access to restore. Grant validators access under Access afterwards.'
						)}
					</li>
				</ul>

				<Form method="POST">
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<DialogFooter>
						<Button type="button" variant="outline" asChild>
							<Link to={stepsUrl}>Cancel</Link>
						</Button>
						<StatusButton
							type="submit"
							disabled={isPending}
							status={isPending ? 'pending' : 'idle'}
						>
							<ArchiveRestore className="mr-1 h-4 w-4" />
							Restore Step
						</StatusButton>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}

function Strong({ children }: { children: React.ReactNode }) {
	return <span className="font-medium text-foreground">{children}</span>
}
