import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet } from '@remix-run/react'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { requireUserWithRoles } from '~/utils/auth.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	return json({})
}

export default function MenusRoute() {
	return <Outlet />
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => (
					<ErrorDisplay
						title="Menu not found"
						message="The menu you are looking for does not exist."
						redirectUrl="/admin/menus"
						errorCode={404}
					/>
				),
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You don't have permission to view participants."
						redirectUrl="/admin/menus"
					/>
				),
			}}
		/>
	)
}
