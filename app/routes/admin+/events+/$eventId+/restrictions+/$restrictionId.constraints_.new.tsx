import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRole } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { ConstraintEditor } from './__constraint-editor'
export { action } from './__constraint-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')

	const { restrictionId } = params

	const restriction = await prisma.restriction.findUnique({
		select: {
			id: true,
			tenantId: true,
			eventId: true,
		},
		where: { id: restrictionId },
	})

	invariantResponse(restriction, 'Restriction not found', { status: 404 })

	return json({ restriction })
}

export default function AddConstraintRoute() {
	const { restriction } = useLoaderData<typeof loader>()
	return <ConstraintEditor title="Add Constraint" restriction={restriction} />
}
