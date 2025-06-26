import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { requireUser } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUser(request)

	const participantTypes = await prisma.participantType.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	return json({ participantTypes })
}

export default function TemplatesRoute() {
	const { participantTypes } = useLoaderData<typeof loader>()
	return <Outlet context={{ participantTypes }} />
}
