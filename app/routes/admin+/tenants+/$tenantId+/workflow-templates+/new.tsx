import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useParams } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { TemplateEditor } from './__template-editor'
export { action } from './__template-editor.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])
	return json({})
}

export default function NewWorkflowTemplateRoute() {
	const { tenantId } = useParams()

	return (
		<TemplateEditor
			tenantId={tenantId!}
			title="Create Workflow Template"
			description="Create a new reusable workflow template."
			intent="add"
			cancelUrl={`/admin/tenants/${tenantId}/workflow-templates`}
		/>
	)
}
