import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet } from '@remix-run/react'
import { requireUser } from '~/utils/auth.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUser(request)

	return json({})
}

export default function RestrictionsRoute() {
	return <Outlet />
}
