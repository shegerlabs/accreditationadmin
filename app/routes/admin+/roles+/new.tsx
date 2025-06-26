import { json, LoaderFunctionArgs } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
import { RoleEditor } from './__role-editor'
export { action } from './__role-editor.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	return json({})
}

export default function AddRoleRoute() {
	return <RoleEditor title="Add Role" />
}
