import { LoaderFunctionArgs, redirect } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { RoleEditor } from './__role-editor'
export { action } from './__role-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	// const { roleId } = params

	// const role = await prisma.role.findUnique({
	// 	where: { id: roleId },
	// 	include: {
	// 		permissions: {
	// 			select: {
	// 				id: true,
	// 				action: true,
	// 				entity: true,
	// 				access: true,
	// 			},
	// 		},
	// 	},
	// })

	// invariantResponse(role, 'Not Found', { status: 404 })

	// return json({ role })

	throw redirect('/admin/roles')
}

export default function EditRoleRoute() {
	const { role } = useLoaderData<typeof loader>()
	return <RoleEditor role={role} title="Edit Role" />
}
