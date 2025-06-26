import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { ParticipantEditor } from './__participant-editor'
export { action } from './__participant-editor.server'

export async function loader({ params }: LoaderFunctionArgs) {
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		include: { documents: true },
	})

	invariantResponse(participant, 'Not Found', { status: 404 })

	return json({ participant })
}

export default function DeleteParticipantRoute() {
	const { participant } = useLoaderData<typeof loader>()
	return (
		<ParticipantEditor
			participant={participant}
			title="Delete Participant"
			intent="delete"
		/>
	)
}
