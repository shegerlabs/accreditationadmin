import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	// Fetch shared filter options for all reports
	const [events, participantTypes, countries, users] = await Promise.all([
		prisma.event.findMany({
			where: tenantFilter,
			select: {
				id: true,
				name: true,
			},
			orderBy: { name: 'asc' },
		}),
		prisma.participantType.findMany({
			where: tenantFilter,
			select: {
				id: true,
				name: true,
			},
			orderBy: { name: 'asc' },
		}),
		prisma.country.findMany({
			select: {
				id: true,
				name: true,
			},
			orderBy: { name: 'asc' },
		}),
		prisma.user.findMany({
			where: {
				...(user.isGlobalAdmin ? {} : { tenantId: user.tenantId }),
			},
			select: {
				id: true,
				name: true,
				username: true,
			},
			orderBy: { name: 'asc' },
		}),
	])

	return json({
		events,
		participantTypes,
		countries,
		users,
		user: {
			id: user.id,
			isGlobalAdmin: user.isGlobalAdmin,
			tenantId: user.tenantId,
		},
	})
}

export default function ReportsRoute() {
	const { events, participantTypes, countries, users, user } =
		useLoaderData<typeof loader>()

	return (
		<Outlet
			context={{
				events,
				participantTypes,
				countries,
				users,
				user,
			}}
		/>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You don't have permission to view reports."
						redirectUrl="/admin"
					/>
				),
			}}
		/>
	)
}
