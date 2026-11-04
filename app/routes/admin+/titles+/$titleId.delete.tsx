import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { TitleEditor } from './__title-editor'
export { action } from './__title-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { titleId } = params

	const title = await prisma.title.findUnique({
		where: { id: titleId },
		select: {
			id: true,
			name: true,
		},
	})

	invariantResponse(title, 'Title not found', { status: 404 })

	return json({ title })
}

export default function DeleteTitleRoute() {
	const { title } = useLoaderData<typeof loader>()
	return <TitleEditor title={title} dialogTitle="Delete Title" intent="delete" />
}
