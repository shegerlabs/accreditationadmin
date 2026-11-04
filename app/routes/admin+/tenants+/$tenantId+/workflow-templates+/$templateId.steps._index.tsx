import { LoaderFunctionArgs, redirect } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { tenantId, templateId } = params

	return redirect(`/admin/tenants/${tenantId}/workflow-templates/${templateId}/steps/visual`)
}
