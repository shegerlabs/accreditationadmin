import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { requireUser } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUser(request)

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

	const restrictions = await prisma.restriction.findMany({
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

	return json({ tenants, events, restrictions, participantTypes })
}

export default function InvitationsRoute() {
	const { tenants, events, restrictions, participantTypes } =
		useLoaderData<typeof loader>()
	return (
		<Outlet context={{ tenants, events, restrictions, participantTypes }} />
	)
}
