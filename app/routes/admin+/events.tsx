import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const tenants = await prisma.tenant.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	return json({ tenants })
}

export default function EventsRoute() {
	const { tenants } = useLoaderData<typeof loader>()
	return <Outlet context={{ tenants }} />
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You don't have permission to view events."
						redirectUrl="/"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
