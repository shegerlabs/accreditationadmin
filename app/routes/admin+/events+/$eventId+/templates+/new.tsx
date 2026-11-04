import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { TemplateEditor } from './__template-editor'
export { action } from './__template-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		select: {
			id: true,
			name: true,
			tenantId: true,
		},
		where: { id: eventId },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	return json({ event })
}

export default function AddTemplateRoute() {
	const { event } = useLoaderData<typeof loader>()
	return <TemplateEditor title="Add New Template" intent="add" event={event} />
}
