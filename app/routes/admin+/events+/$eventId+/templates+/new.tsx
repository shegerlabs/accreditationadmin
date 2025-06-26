import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { TemplateEditor } from './__template-editor'
export { action } from './__template-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		select: {
			id: true,
			name: true,
			tenantId: true,
		},
		where: { id: eventId },
	})

	return json({ event })
}

export default function AddTemplateRoute() {
	const { event } = useLoaderData<typeof loader>()
	return <TemplateEditor title="Add New Template" intent="add" event={event} />
}
