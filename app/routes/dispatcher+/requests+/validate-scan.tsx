import { json, LoaderFunctionArgs } from '@remix-run/node'
import {
	getUserAccessibleStepIds,
	requireUserWithRoles,
} from '~/utils/auth.server'
import { getRevokedBadgeError, parseBadgeQr } from '~/utils/badge-qr'
import { prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['dispatcher'])

	const url = new URL(request.url)
	const qrData = url.searchParams.get('q')

	if (!qrData) {
		return json({ ok: false, error: 'No QR data provided' } as const)
	}

	const scanned = parseBadgeQr(qrData)
	const participantId = scanned?.id ?? null

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
			badgeVersion: true,
			badgeRevokedAt: true,
			badgeRevokedReason: true,
			participantType: {
				select: { name: true },
			},
		},
	})

	if (!participant) {
		return json({ ok: false, error: 'Participant not found' } as const)
	}

	const revokedError = getRevokedBadgeError(participant, scanned?.version ?? null)
	if (revokedError) {
		return json({ ok: false, error: revokedError } as const)
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
