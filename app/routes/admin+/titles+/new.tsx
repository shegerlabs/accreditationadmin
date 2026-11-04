import { LoaderFunctionArgs, json } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
import { TitleEditor } from './__title-editor'
export { action } from './__title-editor.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	return json({})
}

export default function AddTitleRoute() {
	return <TitleEditor dialogTitle="Add Title" intent="add" />
}
