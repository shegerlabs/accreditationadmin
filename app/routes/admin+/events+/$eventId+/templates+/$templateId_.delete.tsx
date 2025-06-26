import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { TemplateEditor } from './__template-editor'
export { action } from './__template-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId, templateId } = params

	const event = await prisma.event.findUnique({
		where: { id: eventId },
	})

	invariantResponse(event, 'Not Found', { status: 404 })

	const template = await prisma.template.findUnique({
		where: { id: templateId },
		include: { attachments: true },
	})

	invariantResponse(template, 'Not Found', { status: 404 })

	return json({ template, event })
}

export default function DeleteTemplateRoute() {
	const { template, event } = useLoaderData<typeof loader>()
	return (
		<TemplateEditor
			template={template}
			event={event}
			title="Delete Template"
			intent="delete"
		/>
	)
}
