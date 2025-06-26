import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { MeetingTypeEditor } from './__meeting-type-editor'
export { action } from './__meeting-type-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { tenantId } = params

	const tenant = await prisma.tenant.findUnique({
		where: { id: tenantId },
	})

	invariantResponse(tenant, 'Tenant not found', { status: 404 })

	return json({ tenant })
}

export default function AddMeetingTypeRoute() {
	const { tenant } = useLoaderData<typeof loader>()

	return <MeetingTypeEditor title="Add New Meeting Type" tenant={tenant} />
}
