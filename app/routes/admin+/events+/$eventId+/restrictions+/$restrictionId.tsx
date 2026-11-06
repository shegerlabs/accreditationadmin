import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { getEventParticipantTypes } from '~/utils/event-participant-types.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const participantTypes = await getEventParticipantTypes(params.eventId!, {
		includeAny: true,
	})

	return json({ participantTypes })
}

export default function EditRestrictionRoute() {
	const { participantTypes } = useLoaderData<typeof loader>()

	return <Outlet context={{ participantTypes }} />
}
