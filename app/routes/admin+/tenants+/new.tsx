import { json, LoaderFunctionArgs } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
import { TenantEditor } from './__tenant-editor'
export { action } from './__tenant-editor.server'

export async function loader({ request }: LoaderFunctionArgs) {
	// Only global admins can create new tenants
	await requireUserWithRoles(request, ['admin'])

	return json({})
}

export default function AddTenantRoute() {
	return <TenantEditor title="Add Tenant" />
}
