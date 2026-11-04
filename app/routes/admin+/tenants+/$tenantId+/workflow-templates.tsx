import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet } from '@remix-run/react'
import { requireAdminAccess } from '~/utils/auth.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const { tenantId } = params

	// Tenant admins can only access their own tenant's workflow templates
	if (!currentUser.isGlobalAdmin && tenantId !== currentUser.tenantId) {
		throw json({ message: 'Access denied' }, { status: 403 })
	}

	return json({})
}

export default function WorkflowTemplatesRoute() {
	return <Outlet />
}
