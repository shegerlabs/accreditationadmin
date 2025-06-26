import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { ParticipantTypeEditor } from './__participant-type-editor'
export { action } from './__participant-type-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { tenantId, participantTypeId } = params

	const tenant = await prisma.tenant.findUnique({
		where: { id: tenantId },
	})

	invariantResponse(tenant, 'Tenant not found', { status: 404 })

	const participantType = await prisma.participantType.findUnique({
		where: { id: participantTypeId },
	})

	invariantResponse(participantType, 'Participant Type not found', {
		status: 404,
	})

	return json({ participantType, tenant })
}

export default function DeleteParticipantTypeRoute() {
	const { participantType, tenant } = useLoaderData<typeof loader>()

	return (
		<ParticipantTypeEditor
			participantType={participantType}
			title="Delete Participant Type"
			intent="delete"
			tenant={tenant}
		/>
	)
}
