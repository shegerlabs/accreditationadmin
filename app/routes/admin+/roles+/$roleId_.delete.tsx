import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { RoleEditor } from './__role-editor'
export { action } from './__role-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { roleId } = params

	const role = await prisma.role.findUnique({
		where: { id: roleId },
	})

	invariantResponse(role, 'Not Found', { status: 404 })

	return json({ role })
}

export default function DeleteRoleRoute() {
	const { role } = useLoaderData<typeof loader>()
	return <RoleEditor role={role} title="Delete Role" intent="delete" />
}
