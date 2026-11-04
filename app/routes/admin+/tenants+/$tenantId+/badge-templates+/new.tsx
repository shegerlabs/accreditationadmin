import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useParams } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { BadgeTemplateEditor } from './__badge-template-editor'
export { action } from './__badge-template-editor.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])
	return json({})
}

export default function NewBadgeTemplateRoute() {
	const { tenantId } = useParams()

	return (
		<BadgeTemplateEditor
			tenantId={tenantId!}
			title="Create Badge Template"
			description="Create a new badge design template."
			intent="add"
			cancelUrl={`/admin/tenants/${tenantId}/badge-templates`}
		/>
	)
}
