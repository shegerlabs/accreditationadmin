import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { requireUserWithRoles } from '~/utils/auth.server'
import { getCachedCountries } from '~/utils/cache.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const tenants = await prisma.tenant.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const events = await prisma.event.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const participantTypes = await prisma.participantType.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const meetingTypes = await prisma.meetingType.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const countries = await getCachedCountries()

	return json({
		tenants,
		events,
		participantTypes,
		meetingTypes,
		countries,
	})
}

export default function ParticipantsRoute() {
	const { tenants, events, participantTypes, meetingTypes, countries } =
		useLoaderData<typeof loader>()
	return (
		<Outlet
			context={{
				tenants,
				events,
				participantTypes,
				meetingTypes,
				countries,
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
						message="You don't have permission to view participants."
						redirectUrl="/admin"
					/>
				),
			}}
		/>
	)
}
