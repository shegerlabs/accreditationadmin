import { LoaderFunctionArgs, json } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
import { CountryEditor } from './__country-editor'
export { action } from './__country-editor.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	return json({})
}

export default function AddCountryRoute() {
	return <CountryEditor title="Add Country" intent="add" />
}
