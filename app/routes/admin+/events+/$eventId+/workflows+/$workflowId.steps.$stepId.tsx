import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData, useParams } from '@remix-run/react'
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
export { action } from './__step-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { workflowId, stepId } = params

	const workflow = await prisma.workflow.findUnique({
		select: {
			id: true,
			name: true,
			tenantId: true,
			eventId: true,
		},
		where: { id: workflowId },
	})

	invariantResponse(workflow, 'Not Found', { status: 404 })

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
			role: {
				select: { name: true },
			},
		},
		where: { id: stepId },
	})

	invariantResponse(step, 'Not Found', { status: 404 })

	const steps = await prisma.step.findMany({
		where: { workflowId },
		select: { id: true, name: true, action: true },
		orderBy: { order: 'asc' },
	})

	const roles = await prisma.role.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})

	return json({ workflow, step, steps, roles })
}

export default function EditStepSheetRoute() {
	const { workflow, step, steps, roles } = useLoaderData<typeof loader>()
	const { eventId, workflowId } = useParams()
	const cancelUrl = `/admin/events/${eventId}/workflows/${workflowId}/steps`

	return (
		<Sheet open>
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
						}}
						workflow={workflow}
						roles={roles}
						steps={steps}
						intent="edit"
						actionUrl={`/admin/events/${eventId}/workflows/${workflowId}/steps/${step.id}`}
						cancelUrl={cancelUrl}
					/>
				</div>
			</SheetContent>
		</Sheet>
	)
}
