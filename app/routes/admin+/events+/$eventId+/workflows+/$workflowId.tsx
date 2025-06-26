import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { tenantId } = params

	const participantTypes = await prisma.participantType.findMany({
		where: { tenantId },
	})

	const roles = await prisma.role.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	return json({ participantTypes, roles })
}

export default function IndexRoute() {
	const { participantTypes, roles } = useLoaderData<typeof loader>()

	return <Outlet context={{ participantTypes, roles }} />
}
