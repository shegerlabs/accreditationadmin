import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { requireAdminAccess } from '~/utils/auth.server'
import {
	assign,
	findPeople,
	loadBoxes,
	loadPlacementsFor,
} from '~/utils/boxes.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

/** Participants an admin can add to a box, by name, code or invitation. */
export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const eventId = params.eventId
	invariantResponse(eventId, 'Event ID is required')
	if (!user.isGlobalAdmin && !user.tenantId)
		throw json({ error: 'Access denied' }, { status: 403 })
	const event = await prisma.event.findFirst({
		where: {
			id: eventId,
			...(user.isGlobalAdmin ? {} : { tenantId: user.tenantId! }),
		},
		select: { id: true },
	})
	invariantResponse(event, 'Access denied', { status: 403 })

	const url = new URL(request.url)
	const q = url.searchParams.get('q')?.trim() ?? ''
	if (q.length < 2) return json({ q, results: [] })

	const boxes = await loadBoxes({ eventId })
	const box = boxes.find(b => b.id === url.searchParams.get('box'))
	invariantResponse(box, 'Box not found', { status: 404 })

	// Search a page of matches, then leave out anyone already in the box and
	// say where the rest are. Only these candidates' placements are loaded.
	const contains = { contains: q, mode: 'insensitive' as const }
	const candidates = await findPeople(
		{
			eventId,
			OR: [
				{ firstName: contains },
				{ familyName: contains },
				{ registrationCode: contains },
				{ email: contains },
				{ invitation: { organization: contains } },
			],
		},
		{ take: 50 },
	)
	const placements = await loadPlacementsFor(candidates.map(p => p.id))
	const assignments = assign(boxes, candidates, placements)
	const nameOf = new Map(boxes.map(b => [b.id, b.name]))
	return json({
		q,
		results: candidates
			.filter(p => assignments.get(p.id)?.boxId !== box.id)
			.slice(0, 10)
			.map(p => {
				const a = assignments.get(p.id)
				return {
					id: p.id,
					firstName: p.firstName,
					familyName: p.familyName,
					code: p.code,
					typeName: p.typeName,
					invitationName: p.invitationName,
					/** The box they're in now; adding them here moves them. */
					inBox: a ? (nameOf.get(a.boxId) ?? null) : null,
					/** Their printed badge is in that box, so they can't move. */
					locked: !!a && placements[p.id]?.boxId === a.boxId,
				}
			}),
	})
}
