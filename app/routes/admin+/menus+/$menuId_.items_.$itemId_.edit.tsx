import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { MenuItemEditor } from './__menu-item-editor'
export { action } from './__menu-item-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { itemId } = params

	const menuItem = await prisma.menuItem.findUnique({
		where: { id: itemId },
		include: {
			roles: {
				select: {
					id: true,
					name: true,
				},
			},
		},
	})

	invariantResponse(menuItem, 'Not Found', { status: 404 })

	const roles = await prisma.role.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	return json({ menuItem, roles })
}

export default function MenuItemEditorRoute() {
	const { menuItem, roles } = useLoaderData<typeof loader>()

	return (
		<MenuItemEditor
			menuItem={menuItem}
			roles={roles}
			title={`Edit Menu Item: ${menuItem.title}`}
			intent="edit"
		/>
	)
}
