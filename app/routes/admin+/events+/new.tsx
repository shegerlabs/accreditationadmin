import { json, LoaderFunctionArgs } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
import { EventEditor } from './__event-editor'
export { action } from './__event-editor.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	return json({})
}

export default function AddEventRoute() {
	return <EventEditor title="Add Event" />
}
