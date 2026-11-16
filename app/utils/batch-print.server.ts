import type { BadgeElement } from '~/components/badge-designer'
import { badgeQrUrl } from './badge-qr'
import {
	type BadgeProblems,
	badgeProblems,
	type PrintBadge,
	type PrintTemplate,
} from './batch-print'
import { prisma } from './db.server'
import { getAttachmentFileSrc, getParticipantDocumentFileSrc } from './misc'

const key = (eventId: string, typeId: string) => `${eventId}:${typeId}`

/** Each event and type's badge template, keyed by `eventId:typeId`. */
async function loadTemplates(eventIds: string[], typeIds: string[]) {
	const rows = await prisma.template.findMany({
		where: {
			eventId: { in: eventIds },
			participantTypeId: { in: typeIds },
			templateType: 'BADGE',
		},
		select: {
			eventId: true,
			participantTypeId: true,
			attachments: { select: { id: true, altText: true } },
			badgeTemplate: {
				select: {
					id: true,
					name: true,
					width: true,
					height: true,
					borderWidth: true,
					borderColor: true,
					borderRadius: true,
					badgeIdPrefix: true,
					elements: true,
				},
			},
		},
	})
	return new Map(
		rows.map(t => [
			key(t.eventId, t.participantTypeId),
			{
				attachments: t.attachments,
				badgeTemplate: t.badgeTemplate
					? ({
							...t.badgeTemplate,
							elements:
								(t.badgeTemplate.elements as unknown as
									| BadgeElement[]
									| null) ?? [],
						} satisfies PrintTemplate)
					: null,
			},
		]),
	)
}

/** Everything needed to render these participants' badges, in the order given. */
export async function loadPrintBadges({
	ids,
	baseUrl,
}: {
	ids: string[]
	baseUrl: string
}): Promise<PrintBadge[]> {
	if (ids.length === 0) return []
	const participants = await prisma.participant.findMany({
		where: { id: { in: ids } },
		select: {
			id: true,
			eventId: true,
			firstName: true,
			familyName: true,
			email: true,
			organization: true,
			jobTitle: true,
			badgeVersion: true,
			attendClosedSession: true,
			attendExecutiveCouncilClosedSession: true,
			participantTypeId: true,
			title: { select: { name: true } },
			country: { select: { name: true } },
			nationality: { select: { name: true } },
			participantType: { select: { name: true } },
			event: { select: { name: true } },
			documents: {
				where: { documentType: 'PHOTO' },
				select: { id: true },
				take: 1,
			},
		},
	})
	const templates = await loadTemplates(
		[...new Set(participants.map(p => p.eventId))],
		[...new Set(participants.map(p => p.participantTypeId))],
	)
	const byId = new Map(participants.map(p => [p.id, p]))
	return ids.flatMap(id => {
		const p = byId.get(id)
		if (!p) return []
		const template = templates.get(key(p.eventId, p.participantTypeId))
		const attachment = (alt: string) =>
			getAttachmentFileSrc(
				template?.attachments.find(a => a.altText === alt)?.id ?? '',
			)
		return [
			{
				id: p.id,
				firstName: p.firstName,
				familyName: p.familyName,
				title: p.title?.name ?? null,
				email: p.email,
				organization: p.organization,
				jobTitle: p.jobTitle,
				country: p.country.name,
				nationality: p.nationality.name,
				typeName: p.participantType.name,
				eventName: p.event.name,
				closedSession: p.attendClosedSession,
				executiveCouncilClosedSession: p.attendExecutiveCouncilClosedSession,
				profileUrl: badgeQrUrl(baseUrl, p),
				photoUrl: getParticipantDocumentFileSrc(p.documents[0]?.id ?? ''),
				frontUrl: attachment('Front'),
				backUrl: attachment('Back'),
				template: template?.badgeTemplate ?? null,
				problems: badgeProblems(
					template?.badgeTemplate?.elements,
					!!p.documents[0],
				),
			},
		]
	})
}

/**
 * What would go wrong printing each of these people's badges now, keyed by
 * participant id. Only people with a problem are listed.
 */
export async function loadBadgeProblems(
	people: Array<{ id: string; eventId: string; typeId: string }>,
): Promise<Record<string, BadgeProblems>> {
	if (people.length === 0) return {}
	const eventIds = [...new Set(people.map(p => p.eventId))]
	const [templates, photos] = await Promise.all([
		loadTemplates(eventIds, [...new Set(people.map(p => p.typeId))]),
		prisma.participantDocument.findMany({
			where: {
				documentType: 'PHOTO',
				participant: { eventId: { in: eventIds } },
			},
			select: { participantId: true },
		}),
	])
	const withPhoto = new Set(photos.map(d => d.participantId))
	const out: Record<string, BadgeProblems> = {}
	for (const p of people) {
		const problems = badgeProblems(
			templates.get(key(p.eventId, p.typeId))?.badgeTemplate?.elements,
			withPhoto.has(p.id),
		)
		if (problems.noPhoto || problems.noDesign) out[p.id] = problems
	}
	return out
}
