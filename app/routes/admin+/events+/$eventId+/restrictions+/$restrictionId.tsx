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

	return json({ participantTypes })
}

export default function EditRestrictionRoute() {
	const { participantTypes } = useLoaderData<typeof loader>()

	return <Outlet context={{ participantTypes }} />
}
