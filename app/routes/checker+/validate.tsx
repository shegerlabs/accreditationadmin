import { AuditAction, AuditEntityType } from '@prisma/client'
import { json, LoaderFunctionArgs } from '@remix-run/node'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { getRevokedBadgeError, parseBadgeQr } from '~/utils/badge-qr'
import { prisma } from '~/utils/db.server'

const DUPLICATE_WINDOW_MINUTES = 10

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['checkpoint'])

	const url = new URL(request.url)
	const qrData = url.searchParams.get('q')

	if (!qrData) {
		return json({ ok: false, error: 'No QR data provided' } as const)
	}

	const scanned = parseBadgeQr(qrData)
	const participantId = scanned?.id ?? null

	if (!participantId) {
		await auditRequest({
			request,
			action: AuditAction.VERIFY,
			entityType: AuditEntityType.PARTICIPANT,
			description: `Scan failed: could not extract participant ID from QR code`,
			userId: user.id,
			metadata: { result: 'invalid', error: 'Could not extract participant ID from QR code' },
		})
		return json({
			ok: false,
			error: 'Could not extract participant ID from QR code',
		} as const)
	}

	// Look up the participant by ID first, then by registration code
	let participant = await prisma.participant.findUnique({
		where: { id: participantId },
		include: {
			title: { select: { name: true } },
			country: { select: { name: true } },
			nationality: { select: { name: true } },
			participantType: { select: { name: true } },
			event: { select: { id: true, name: true } },
			documents: true,
		},
	})

	if (!participant) {
		participant = await prisma.participant.findUnique({
			where: { registrationCode: participantId },
			include: {
				title: { select: { name: true } },
				country: { select: { name: true } },
				nationality: { select: { name: true } },
				participantType: { select: { name: true } },
				event: { select: { id: true, name: true } },
				documents: true,
			},
		})
	}

	if (!participant) {
		await auditRequest({
			request,
			action: AuditAction.VERIFY,
			entityType: AuditEntityType.PARTICIPANT,
			description: `Scan failed: participant not found (${participantId})`,
			userId: user.id,
			metadata: { result: 'invalid', error: 'Participant not found' },
		})
		return json({ ok: false, error: 'Participant not found' } as const)
	}

	const revokedError = getRevokedBadgeError(participant, scanned?.version ?? null)
	if (revokedError) {
		await auditRequest({
			request,
			action: AuditAction.VERIFY,
			entityType: AuditEntityType.PARTICIPANT,
			entityId: participant.id,
			description: `Scan rejected for ${participant.firstName} ${participant.familyName} (${participant.registrationCode}): revoked badge v${scanned?.version}, current is v${participant.badgeVersion}`,
			userId: user.id,
			tenantId: participant.tenantId,
			metadata: {
				result: 'invalid',
				registrationCode: participant.registrationCode,
				firstName: participant.firstName,
				familyName: participant.familyName,
				participantType: participant.participantType?.name,
				session: participant.attendExecutiveCouncilClosedSession ? 'executive' : participant.attendClosedSession ? 'closed' : 'open',
				error: revokedError,
				scannedBadgeVersion: scanned?.version,
				currentBadgeVersion: participant.badgeVersion,
			},
		})
		return json({ ok: false, error: revokedError } as const)
	}

	// Check valid badge status (PRINTED or COLLECTED)
	if (participant.status !== 'PRINTED' && participant.status !== 'COLLECTED') {
		const error = `Badge status is ${participant.status}, not valid for entry`
		await auditRequest({
			request,
			action: AuditAction.VERIFY,
			entityType: AuditEntityType.PARTICIPANT,
			entityId: participant.id,
			description: `Scan failed for ${participant.firstName} ${participant.familyName} (${participant.registrationCode}): ${error}`,
			userId: user.id,
			tenantId: participant.tenantId,
			metadata: {
				result: 'invalid',
				registrationCode: participant.registrationCode,
				firstName: participant.firstName,
				familyName: participant.familyName,
				participantType: participant.participantType?.name,
				session: participant.attendExecutiveCouncilClosedSession ? 'executive' : participant.attendClosedSession ? 'closed' : 'open',
				error,
			},
		})
		return json({
			ok: false,
			error,
		} as const)
	}

	// Check for duplicate scan within the last N minutes
	const duplicateWindow = new Date(
		Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000,
	)
	const recentVerify = await prisma.auditLog.findFirst({
		where: {
			action: AuditAction.VERIFY,
			entityType: AuditEntityType.PARTICIPANT,
			entityId: participant.id,
			createdAt: { gte: duplicateWindow },
			// A rejected scan doesn't mean the person got in.
			NOT: { metadata: { path: ['result'], equals: 'invalid' } },
		},
		orderBy: { createdAt: 'desc' },
		select: { createdAt: true },
	})

	// Log audit entry for the verification
	const isDuplicate = !!recentVerify
	await auditRequest({
		request,
		action: AuditAction.VERIFY,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participant.id,
		description: isDuplicate
			? `Duplicate scan for ${participant.firstName} ${participant.familyName} (${participant.registrationCode}) [${participant.participantType?.name}]`
			: `Badge verified for ${participant.firstName} ${participant.familyName} (${participant.registrationCode}) [${participant.participantType?.name}]`,
		userId: user.id,
		tenantId: participant.tenantId,
		metadata: {
			result: isDuplicate ? 'duplicate' : 'valid',
			registrationCode: participant.registrationCode,
			firstName: participant.firstName,
			familyName: participant.familyName,
			participantType: participant.participantType?.name,
			session: participant.attendExecutiveCouncilClosedSession ? 'executive' : participant.attendClosedSession ? 'closed' : 'open',
		},
	})

	const photo = participant.documents.find(
		doc => doc.documentType === 'PHOTO',
	)

	return json({
		ok: true,
		participant: {
			id: participant.id,
			titleName: participant.title?.name ?? '',
			firstName: participant.firstName,
			familyName: participant.familyName,
			gender: participant.gender,
			organization: participant.organization,
			jobTitle: participant.jobTitle,
			registrationCode: participant.registrationCode,
			status: participant.status,
			email: participant.email,
			telephone: participant.telephone,
			attendClosedSession: participant.attendClosedSession,
			attendExecutiveCouncilClosedSession:
				participant.attendExecutiveCouncilClosedSession,
			countryName: participant.country?.name ?? '',
			nationalityName: participant.nationality?.name ?? '',
			participantTypeName: participant.participantType?.name ?? '',
			eventName: participant.event.name,
			photoId: photo?.id ?? null,
		},
		duplicateWarning: recentVerify
			? recentVerify.createdAt.toISOString()
			: null,
		// A typed-in or searched lookup can't tell which badge is in front of the
		// checker, so if one was ever revoked they have to look at it.
		revokedWarning:
			scanned?.version === null && participant.badgeRevokedAt
				? participant.badgeRevokedReason ?? 'No reason given'
				: null,
	} as const)
}
