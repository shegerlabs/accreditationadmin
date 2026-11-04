import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'

export async function loader({ request }: LoaderFunctionArgs) {
	// Permissions management is a global admin function only
	await requireUserWithRoles(request, ['admin'])
	return json({})
}

export default function PermissionsRoute() {
	return <Outlet />
}
