import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { PermissionEditor } from './__permission-editor'
export { action } from './__permission-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { permissionId } = params

	const permission = await prisma.permission.findUnique({
		where: { id: permissionId },
	})

	invariantResponse(permission, 'Not Found', { status: 404 })

	return json({ permission })
}

export default function DeletePermissionRoute() {
	const { permission } = useLoaderData<typeof loader>()
	return (
		<PermissionEditor
			permission={permission}
			title="Delete Permission"
			intent="delete"
		/>
	)
}
