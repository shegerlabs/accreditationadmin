import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { SecretsEditor } from './__secrets-editor'
export { action } from './__invitation-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		where: { id: eventId },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	return json({ event })
}

export default function GenerateSecretsRoute() {
	const { event } = useLoaderData<typeof loader>()
	return <SecretsEditor event={event} title="Generate Secrets" />
}
