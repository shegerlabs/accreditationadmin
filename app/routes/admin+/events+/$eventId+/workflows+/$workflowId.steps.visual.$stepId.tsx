import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData, useNavigate, useOutletContext, useParams } from '@remix-run/react'
import type { SerializeFrom } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '~/components/ui/sheet'
import { StepForm } from '~/components/workflow-builder/step-form'
import { WorkflowData } from '~/components/workflow-builder/types'
export { action } from './__step-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { stepId } = params

	const step = await prisma.step.findUnique({
		select: {
			id: true,
			name: true,
			action: true,
			tenantId: true,
			workflowId: true,
			roleId: true,
			order: true,
			nextStepId: true,
			isRejectionTarget: true,
			isBypassTarget: true,
			requiresAssignment: true,
			slaDurationMinutes: true,
			role: {
				select: { name: true },
			},
		},
		where: { id: stepId },
	})

	invariantResponse(step, 'Not Found', { status: 404 })

	return json({ step })
}

export default function VisualEditStepSheetRoute() {
	const { step } = useLoaderData<typeof loader>()
	const { workflow, roles, steps } = useOutletContext<{
		workflow: SerializeFrom<WorkflowData>
		roles: Array<{ id: string; name: string }>
		steps: Array<{ id: string; name: string }>
	}>()
	const { eventId, workflowId } = useParams()
	const navigate = useNavigate()
	const cancelUrl = `/admin/events/${eventId}/workflows/${workflowId}/steps/visual`

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			navigate(cancelUrl)
		}
	}

	return (
		<Sheet open onOpenChange={handleOpenChange}>
			<SheetContent className="overflow-y-auto sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Edit Step: {step.name}</SheetTitle>
					<SheetDescription>Modify the step configuration.</SheetDescription>
				</SheetHeader>
				<div className="mt-6">
					<StepForm
						step={{
							id: step.id,
							name: step.name,
							action: step.action,
							order: step.order,
							roleId: step.roleId,
							roleName: step.role.name,
							nextStepId: step.nextStepId,
							isRejectionTarget: step.isRejectionTarget,
							isBypassTarget: step.isBypassTarget,
							requiresAssignment: step.requiresAssignment,
							slaDurationMinutes: step.slaDurationMinutes,
						}}
						workflow={workflow}
						roles={roles}
						steps={steps}
						intent="edit"
						actionUrl={`/admin/events/${eventId}/workflows/${workflowId}/steps/visual/${step.id}`}
						cancelUrl={cancelUrl}
						redirectUrl={cancelUrl}
					/>
				</div>
			</SheetContent>
		</Sheet>
	)
}
