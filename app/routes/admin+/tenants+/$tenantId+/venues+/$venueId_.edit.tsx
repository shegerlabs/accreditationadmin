import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { VenueEditor } from './__venue-editor'
export { action } from './__venue-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { tenantId, venueId } = params

	const tenant = await prisma.tenant.findUnique({
		where: { id: tenantId },
	})

	invariantResponse(tenant, 'Tenant not found', { status: 404 })

	const venue = await prisma.venue.findUnique({
		where: { id: venueId },
	})

	invariantResponse(venue, 'Not Found', { status: 404 })

	return json({ venue, tenant })
}

export default function EditVenueRoute() {
	const { venue, tenant } = useLoaderData<typeof loader>()

	return <VenueEditor venue={venue} tenant={tenant} title="Edit Venue" />
}
