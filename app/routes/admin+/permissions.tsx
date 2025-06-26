import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	return json({})
}

export default function PermissionsRoute() {
	return <Outlet />
}
