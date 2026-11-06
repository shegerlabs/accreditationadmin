// The participant types an event uses, out of its tenant's catalogue.
// Decision record: docs/decisions/2026-11-06-event-participant-types.md

import { type Prisma } from '@prisma/client'
import { prisma } from './db.server'
import { NON_WORKFLOW_PARTICIPANT_TYPES } from './workflow-clone.server'

type Options = {
	/**
	 * Quotas can be set on "Any", which is a bucket rather than a type people
	 * register as. Pass this for restriction and invitation quota pickers.
	 */
	includeAny?: boolean
}

/** The event's participant types, sorted by name. Empty until the event's setup picks them. */
export async function getEventParticipantTypes(
	eventId: string,
	{ includeAny = false }: Options = {},
) {
	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: { tenantId: true },
	})
	if (!event) return []
	return prisma.participantType.findMany({
		where: {
			tenantId: event.tenantId,
			OR: [
				{ events: { some: { eventId } } },
				...(includeAny
					? [{ name: { in: NON_WORKFLOW_PARTICIPANT_TYPES } }]
					: []),
			],
		},
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})
}

/** Whether a form may use this participant type on this event. */
export async function isEventParticipantType(
	eventId: string,
	participantTypeId: string,
	options: Options = {},
) {
	const types = await getEventParticipantTypes(eventId, options)
	return types.some(t => t.id === participantTypeId)
}

/**
 * The types a workflow may be created for: the tenant's whole catalogue except
 * "Any". Creating a workflow is how a type gets added to a running event, so
 * this is wider than the event's list (see addEventParticipantType).
 */
export async function getWorkflowParticipantTypes(eventId: string) {
	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: { tenantId: true },
	})
	if (!event) return []
	return prisma.participantType.findMany({
		where: {
			tenantId: event.tenantId,
			name: { notIn: NON_WORKFLOW_PARTICIPANT_TYPES },
		},
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})
}

/** Put a type on the event's list. Does nothing if it is already there. */
export async function addEventParticipantType(
	db: Prisma.TransactionClient,
	eventId: string,
	participantTypeId: string,
) {
	await db.eventParticipantType.upsert({
		where: { eventId_participantTypeId: { eventId, participantTypeId } },
		create: { eventId, participantTypeId },
		update: {},
	})
}

export const NOT_IN_EVENT_MESSAGE =
	'This participant type is not part of this event. Add it in the event setup first.'
