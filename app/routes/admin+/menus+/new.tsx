import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { MenuEditor } from './__menu-editor'
export { action } from './__menu-editor.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const roles = await prisma.role.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	return json({ roles })
}

export default function AddMenuRoute() {
	const { roles } = useLoaderData<typeof loader>()

	return <MenuEditor title="Add Menu" roles={roles} />
}
