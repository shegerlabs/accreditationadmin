import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { requireUser } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUser(request)

	const venues = await prisma.venue.findMany({
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

	return json({ venues, meetingTypes })
}

export default function MeetingsRoute() {
	const { venues, meetingTypes } = useLoaderData<typeof loader>()
	return <Outlet context={{ venues, meetingTypes }} />
}
