import { json, LoaderFunctionArgs } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
import { PermissionEditor } from './__permission-editor'
export { action } from './__permission-editor.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	return json({})
}

export default function AddPermissionRoute() {
	return <PermissionEditor title="Add Permission" />
}
