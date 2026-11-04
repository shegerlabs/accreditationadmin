import { json, LoaderFunctionArgs } from '@remix-run/node'
import {
	getUserAccessibleStepIds,
	requireUserWithRoles,
} from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['dispatcher'])

	const url = new URL(request.url)
	const qrData = url.searchParams.get('q')

	if (!qrData) {
		return json({ ok: false, error: 'No QR data provided' } as const)
	}

	// Extract participantId from QR data
	// QR codes encode URLs like https://domain/printer/requests/{participantId}
	// Also handle raw IDs
	let participantId: string | null = null

	try {
		const parsed = new URL(qrData)
		const match = parsed.pathname.match(/\/requests\/([^/]+)$/)
		if (match) {
			participantId = match[1]
		}
	} catch {
		// Not a URL — treat the raw string as a participant ID
		participantId = qrData.trim()
	}

	if (!participantId) {
		return json({ ok: false, error: 'Could not extract participant ID from QR code' } as const)
	}

	// Get accessible step IDs for this dispatcher
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['dispatcher'])

	// Look up the participant
	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		select: {
			id: true,
			firstName: true,
			familyName: true,
			organization: true,
			status: true,
			stepId: true,
			participantType: {
				select: { name: true },
			},
		},
	})

	if (!participant) {
		return json({ ok: false, error: 'Participant not found' } as const)
	}

	if (participant.status === 'COLLECTED') {
		return json({ ok: false, error: 'Badge already collected' } as const)
	}

	if (participant.status !== 'PRINTED') {
		return json({
			ok: false,
			error: `Badge status is ${participant.status}, expected PRINTED`,
		} as const)
	}

	if (!participant.stepId || !accessibleStepIds.includes(participant.stepId)) {
		return json({
			ok: false,
			error: 'You do not have access to collect this badge',
		} as const)
	}

	return json({
		ok: true,
		participant: {
			id: participant.id,
			firstName: participant.firstName,
			familyName: participant.familyName,
			organization: participant.organization,
			participantTypeName: participant.participantType?.name ?? '',
		},
	} as const)
}
