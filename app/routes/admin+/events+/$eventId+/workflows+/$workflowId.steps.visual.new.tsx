import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData, useNavigate, useOutletContext, useParams } from '@remix-run/react'
import type { SerializeFrom } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
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

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const url = new URL(request.url)
	const defaultAction = url.searchParams.get('action') ?? 'APPROVE'

	return json({ defaultAction })
}

export default function VisualNewStepSheetRoute() {
	const { defaultAction } = useLoaderData<typeof loader>()
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
						actionUrl={`/admin/events/${eventId}/workflows/${workflowId}/steps/visual/new`}
						cancelUrl={cancelUrl}
						redirectUrl={cancelUrl}
					/>
				</div>
			</SheetContent>
		</Sheet>
	)
}
