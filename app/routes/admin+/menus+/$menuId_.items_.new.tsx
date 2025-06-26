import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { MenuItemEditor } from './__menu-item-editor'
export { action } from './__menu-item-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const roles = await prisma.role.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	return json({ roles })
}

export default function MenuItemEditorRoute() {
	const { roles } = useLoaderData<typeof loader>()

	return (
		<MenuItemEditor roles={roles} title="Add New Menu Item" intent="edit" />
	)
}
