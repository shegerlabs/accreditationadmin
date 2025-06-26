import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { MenuEditor } from './__menu-editor'
export { action } from './__menu-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const { menuId } = params

	const menu = await prisma.menu.findUnique({
		where: { id: menuId },
		include: {
			roles: {
				select: {
					id: true,
					name: true,
				},
			},
		},
	})

	invariantResponse(menu, 'Not Found', { status: 404 })

	const roles = await prisma.role.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	return json({ menu, roles })
}

export default function EditMenuRoute() {
	const { menu, roles } = useLoaderData<typeof loader>()
	return (
		<MenuEditor menu={menu} roles={roles} title={`Edit Menu: ${menu.title}`} />
	)
}
