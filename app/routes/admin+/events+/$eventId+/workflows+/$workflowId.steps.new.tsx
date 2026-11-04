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

	const { workflowId } = params
	const url = new URL(request.url)
	const defaultAction = url.searchParams.get('action') ?? 'APPROVE'

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

	const steps = await prisma.step.findMany({
		where: { workflowId },
		select: { id: true, name: true, action: true },
		orderBy: { order: 'asc' },
	})

	const roles = await prisma.role.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})

	return json({ workflow, steps, roles, defaultAction })
}

export default function NewStepSheetRoute() {
	const { workflow, steps, roles, defaultAction } = useLoaderData<typeof loader>()
	const { eventId, workflowId } = useParams()
	const cancelUrl = `/admin/events/${eventId}/workflows/${workflowId}/steps`

	return (
		<Sheet open>
			<SheetContent className="overflow-y-auto sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Add New Step</SheetTitle>
					<SheetDescription>
						Create a new step for this workflow.
					</SheetDescription>
				</SheetHeader>
				<div className="mt-6">
					<StepForm
						workflow={workflow}
						roles={roles}
						steps={steps}
						defaultAction={defaultAction as any}
						intent="add"
						actionUrl={`/admin/events/${eventId}/workflows/${workflowId}/steps/new`}
						cancelUrl={cancelUrl}
					/>
				</div>
			</SheetContent>
		</Sheet>
	)
}
