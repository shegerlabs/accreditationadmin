import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { MeetingTypeEditor } from './__meeting-type-editor'
export { action } from './__meeting-type-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { tenantId, meetingTypeId } = params

	const tenant = await prisma.tenant.findUnique({
		select: { id: true, name: true },
		where: { id: tenantId },
	})

	invariantResponse(tenant, 'Not Found', { status: 404 })

	const meetingType = await prisma.meetingType.findUnique({
		where: { id: meetingTypeId },
	})

	invariantResponse(meetingType, 'Not Found', { status: 404 })

	return json({ meetingType, tenant })
}

export default function EditMeetingTypeRoute() {
	const { meetingType, tenant } = useLoaderData<typeof loader>()
	return (
		<MeetingTypeEditor
			meetingType={meetingType}
			title="Edit Meeting Type"
			tenant={tenant}
		/>
	)
}
