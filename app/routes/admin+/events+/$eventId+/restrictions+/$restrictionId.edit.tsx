import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { RestrictionEditor } from './__restriction-editor'
export { action } from './__restriction-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId, restrictionId } = params

	const event = await prisma.event.findUnique({
		where: { id: eventId },
	})

	invariantResponse(event, 'Not Found', { status: 404 })

	const restriction = await prisma.restriction.findUnique({
		where: { id: restrictionId },
		include: { constraints: true },
	})

	invariantResponse(restriction, 'Not Found', { status: 404 })

	return json({ restriction, event })
}

export default function EditRestrictionRoute() {
	const { restriction, event } = useLoaderData<typeof loader>()
	return (
		<RestrictionEditor
			restriction={restriction}
			title="Edit Restriction"
			event={event}
		/>
	)
}
