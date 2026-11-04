import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireAdminAccess } from '~/utils/auth.server'
import { EventEditor } from './__event-editor'
export { action } from './__event-editor.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)

	return json({
		isGlobalAdmin: user.isGlobalAdmin,
		userTenantId: user.tenantId,
	})
}

export default function AddEventRoute() {
	const { isGlobalAdmin, userTenantId } = useLoaderData<typeof loader>()

	return (
		<EventEditor
			title="Add Event"
			isGlobalAdmin={isGlobalAdmin}
			userTenantId={userTenantId}
		/>
	)
}
