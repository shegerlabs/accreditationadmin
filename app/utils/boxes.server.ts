import {
	Action,
	AuditAction,
	AuditEntityType,
	type Prisma,
	type RequestStatus,
} from '@prisma/client'
import { auditRequest } from './audit.server'
import { type BadgeProblems } from './batch-print'
import { loadBadgeProblems } from './batch-print.server'
import { getUserAccessibleStepInfo } from './auth.server'
import {
	assignBoxes,
	badgeIsElsewhere,
	countStages,
	NO_INVITATION,
	resolveBox,
	ruleChips,
	sortPeople,
	splitBox,
	type Assignments,
	type BoxDef,
	type BoxesView,
	type BoxPerson,
	type BoxViewer,
	type MemberRow,
	type Part,
	type PartSummary,
	type Placements,
	type ReadyPerson,
	type Stage,
} from './boxes'
import { prisma } from './db.server'
import { processParticipant } from './workflow.server'

export type ServerPerson = BoxPerson & {
	eventId: string
	tenantId: string
	stepId: string
	status: RequestStatus
	email: string | null
}

/**
 * Status settles archived, printed and returned. Otherwise the current step
 * decides: a print step, a validator's step, or else review (reviewer steps,
 * and any other step before print).
 */
function stageOf(
	status: RequestStatus,
	step: { action: Action; role: { name: string } },
): Stage {
	// COLLECTED is no longer set; older records count as archived.
	if (status === 'COLLECTED' || status === 'ARCHIVED') return 'archived'
	if (status === 'PRINTED') return 'printed'
	if (status === 'REJECTED') return 'returned'
	if (step.action === Action.PRINT) return 'print'
	if (step.role.name === 'validator') return 'validation'
	return 'review'
}

/** Everyone a box in these events could hold. Cancelled requests never count. */
export function loadPeople(eventIds: string[]) {
	return findPeople({ eventId: { in: eventIds } })
}

/** Active participants matching `where`, shaped for boxes. */
export async function findPeople(
	where: Prisma.ParticipantWhereInput,
	page?: { take: number },
): Promise<ServerPerson[]> {
	const rows = await prisma.participant.findMany({
		where: { AND: [where, { deletedAt: null, status: { not: 'CANCELLED' } }] },
		...(page && {
			take: page.take,
			orderBy: [{ familyName: 'asc' as const }, { firstName: 'asc' as const }],
		}),
		select: {
			id: true,
			eventId: true,
			tenantId: true,
			registrationCode: true,
			firstName: true,
			familyName: true,
			email: true,
			participantTypeId: true,
			participantType: { select: { name: true } },
			invitationId: true,
			invitation: { select: { organization: true } },
			attendClosedSession: true,
			status: true,
			stepId: true,
			step: { select: { action: true, role: { select: { name: true } } } },
		},
	})
	return rows.map(r => ({
		id: r.id,
		eventId: r.eventId,
		tenantId: r.tenantId,
		code: r.registrationCode,
		firstName: r.firstName,
		familyName: r.familyName,
		email: r.email,
		typeId: r.participantTypeId,
		typeName: r.participantType.name,
		invitationId: r.invitationId,
		invitationName: r.invitation?.organization ?? NO_INVITATION,
		closedSession: r.attendClosedSession,
		status: r.status,
		stepId: r.stepId,
		stage: stageOf(r.status, r.step),
	}))
}

export type LoadedBox = BoxDef & {
	name: string
	eventId: string
	tenantId: string
	eventName: string
	owner: string | null
}

export async function loadBoxes(
	where: Prisma.BoxWhereInput,
): Promise<LoadedBox[]> {
	const rows = await prisma.box.findMany({
		where,
		// List order decides which box a person goes in (see assignBoxes).
		orderBy: [{ position: 'asc' }, { name: 'asc' }],
		include: {
			members: { select: { participantId: true, kind: true } },
			createdBy: { select: { name: true, username: true } },
			event: { select: { name: true } },
		},
	})
	return rows.map(b => ({
		id: b.id,
		name: b.name,
		eventId: b.eventId,
		tenantId: b.tenantId,
		eventName: b.event.name,
		owner: b.createdBy ? b.createdBy.name || b.createdBy.username : null,
		hasRule: b.hasRule,
		participantTypeIds: b.participantTypeIds,
		closedSessionOnly: b.closedSessionOnly,
		splitBy: b.splitBy,
		batchSize: b.batchSize,
		maxPerBox: b.maxPerBox,
		include: b.members
			.filter(m => m.kind === 'INCLUDE')
			.map(m => m.participantId),
		exclude: b.members
			.filter(m => m.kind === 'EXCLUDE')
			.map(m => m.participantId),
	}))
}

export function loadPlacements(eventIds: string[]) {
	return findPlacements({ box: { eventId: { in: eventIds } } })
}

export function loadPlacementsFor(participantIds: string[]) {
	return findPlacements({ participantId: { in: participantIds } })
}

async function findPlacements(
	where: Prisma.BoxPlacementWhereInput,
): Promise<Placements> {
	const rows = await prisma.boxPlacement.findMany({
		where,
		select: {
			participantId: true,
			boxId: true,
			splitBy: true,
			part: true,
			printedAt: true,
		},
	})
	return Object.fromEntries(
		rows.map(r => [
			r.participantId,
			{
				boxId: r.boxId,
				splitBy: r.splitBy,
				part: r.part,
				printed: r.printedAt !== null,
			},
		]),
	)
}

type Readiness = 'ready' | 'done' | 'waiting'
export type ReadinessFn = (
	p: ServerPerson,
	boxId: string,
	placements: Placements,
) => Readiness

/**
 * Who this printer can print now. Mirrors their print queue: the participant
 * is awaiting print at a step they're assigned to, for a type they're assigned
 * to, and their badge isn't locked to another box.
 */
function printerReadiness({
	stepIds,
	participantTypeIds,
}: {
	stepIds: string[]
	participantTypeIds: string[]
}): ReadinessFn {
	const steps = new Set(stepIds)
	const types = new Set(participantTypeIds)
	return (p, boxId, placements) => {
		if (p.stage === 'printed' || p.stage === 'archived') return 'done'
		if (
			steps.has(p.stepId) &&
			types.has(p.typeId) &&
			p.stage === 'print' &&
			!badgeIsElsewhere(p.id, boxId, placements)
		)
			return 'ready'
		return 'waiting'
	}
}

export type Visible = (p: ServerPerson) => boolean

/** Who is in which box, event by event. `boxes` must be in list order. */
export function assign(
	boxes: LoadedBox[],
	people: ServerPerson[],
	placements: Placements,
): Assignments {
	const out: Assignments = new Map()
	for (const eventId of new Set(boxes.map(b => b.eventId)))
		for (const [id, a] of assignBoxes(
			boxes.filter(b => b.eventId === eventId),
			people.filter(p => p.eventId === eventId),
			placements,
		))
			out.set(id, a)
	return out
}

/**
 * The box, its smaller boxes, and the people in scope (the open smaller box,
 * or all). The box is resolved and split over everyone, so Size batches match
 * the physical ones; only then is it narrowed to the people this user may see.
 */
export function scopeBox(
	box: LoadedBox,
	people: ServerPerson[],
	placements: Placements,
	assignments: Assignments,
	partKey: string | null,
	visible: Visible | null = null,
) {
	const resolved = resolveBox(
		box,
		people.filter(p => p.eventId === box.eventId),
		assignments,
	)
	const split = splitBox(box, resolved.members, placements)
	const members = visible ? resolved.members.filter(visible) : resolved.members
	const parts = visible
		? split.flatMap(p => {
				const ms = p.members.filter(visible)
				if (ms.length === 0) return []
				const locked = ms.filter(m => placements[m.id]?.boxId === box.id).length
				return [{ ...p, members: ms, locked }]
			})
		: split
	const part = partKey ? (parts.find(p => p.key === partKey) ?? null) : null
	return {
		members,
		reasons: resolved.reasons,
		inOtherBoxes: resolved.inOtherBoxes,
		parts,
		part,
		scope: part ? part.members : members,
		// Unfiltered, for locking: a Size batch freezes as a whole, including
		// batch-mates this viewer can't see.
		allMembers: resolved.members,
		allParts: split,
	}
}

const toReady = (p: ServerPerson): ReadyPerson => ({
	id: p.id,
	firstName: p.firstName,
	familyName: p.familyName,
	typeName: p.typeName,
})

export function buildView({
	viewer,
	boxes,
	people,
	placements,
	readiness,
	boxId,
	partKey,
	typeName,
	visible = null,
	problems = {},
}: {
	viewer: BoxViewer
	boxes: LoadedBox[]
	people: ServerPerson[]
	placements: Placements
	readiness: ReadinessFn | null
	boxId: string | null
	partKey: string | null
	typeName: (id: string) => string
	/** Printers only see participants of the types they're assigned to. */
	visible?: Visible | null
	/** Badges that would come out wrong, by participant id. */
	problems?: Record<string, BadgeProblems>
}): BoxesView {
	// Printers can only act on people at their desk; admins can fix early.
	const problemOf = (m: ServerPerson) =>
		(
			viewer === 'printer'
				? m.stage === 'print'
				: m.stage !== 'printed' && m.stage !== 'archived'
		)
			? (problems[m.id] ?? null)
			: null
	const needsFixing = (ms: ServerPerson[]) =>
		ms.filter(m => problemOf(m)).length
	const readyIn = (box: LoadedBox, ms: ServerPerson[]) =>
		readiness
			? ms.filter(m => readiness(m, box.id, placements) === 'ready')
			: []
	const doneIn = (box: LoadedBox, ms: ServerPerson[]) =>
		readiness
			? ms.filter(m => readiness(m, box.id, placements) === 'done').length
			: 0
	const summarize = (box: LoadedBox, p: Part<ServerPerson>): PartSummary => ({
		key: p.key,
		label: p.label,
		batch: p.batch,
		total: p.members.length,
		ready: readyIn(box, p.members).length,
		done: doneIn(box, p.members),
		locked: p.locked,
		frozen: p.frozen,
	})

	const assignments = assign(boxes, people, placements)
	const list = boxes.map(box => {
		const { members, parts } = scopeBox(
			box,
			people,
			placements,
			assignments,
			null,
			visible,
		)
		return {
			id: box.id,
			name: box.name,
			owner: box.owner,
			eventName: box.eventName,
			splitBy: box.splitBy,
			total: members.length,
			ready: readyIn(box, members).length,
			done: doneIn(box, members),
			archived:
				viewer === 'admin' &&
				members.length > 0 &&
				members.every(m => m.stage === 'archived'),
			parts: parts.map(p => summarize(box, p)),
		}
	})

	const box = boxes.find(b => b.id === boxId) ?? boxes[0]
	if (!box) return { boxes: list, selected: null }

	const { members, reasons, inOtherBoxes, parts, part, scope } = scopeBox(
		box,
		people,
		placements,
		assignments,
		partKey,
		visible,
	)
	// Reserved, but the badge was printed some other way (the print queue).
	const printedOutside = (m: ServerPerson) =>
		!placements[m.id]?.printed &&
		(m.stage === 'printed' || m.stage === 'archived')
	const placedHere = (m: ServerPerson) => {
		const p = placements[m.id]
		if (p?.boxId !== box.id) return null
		if (p.printed) return 'printed'
		return printedOutside(m) ? 'outside' : 'reserved'
	}
	const ready = readyIn(box, scope)
	const waiting = readiness
		? scope.filter(m => readiness(m, box.id, placements) === 'waiting').length
		: 0
	const byId = new Map(people.map(p => [p.id, p]))

	return {
		boxes: list,
		selected: {
			id: box.id,
			name: box.name,
			owner: box.owner,
			eventName: box.eventName,
			chips: ruleChips(box, typeName),
			hasRule: box.hasRule,
			participantTypeIds: box.participantTypeIds,
			closedSessionOnly: box.closedSessionOnly,
			splitBy: box.splitBy,
			batchSize: box.batchSize,
			maxPerBox: box.maxPerBox,
			part: part ? summarize(box, part) : null,
			total: scope.length,
			stages: countStages(scope),
			readyPeople: ready.map(toReady),
			waiting,
			needsFixing: needsFixing(scope),
			lockedHere: scope.filter(m => placements[m.id]?.boxId === box.id).length,
			lockedInBox: members.filter(m => placements[m.id]?.boxId === box.id)
				.length,
			inOtherBoxes: viewer === 'admin' ? inOtherBoxes : 0,
			parts:
				box.splitBy && !part
					? parts.map(p => {
							const r = readyIn(box, p.members)
							return {
								...summarize(box, p),
								stages: countStages(p.members),
								waiting: readiness
									? p.members.filter(
											m => readiness(m, box.id, placements) === 'waiting',
										).length
									: 0,
								manual: p.members.filter(m => reasons.get(m.id) === 'manual')
									.length,
								readyPeople: r.map(toReady),
								needsFixing: needsFixing(p.members),
							}
						})
					: null,
			members:
				!box.splitBy || part
					? scope.map(
							(m): MemberRow => ({
								id: m.id,
								code: m.code,
								firstName: m.firstName,
								familyName: m.familyName,
								typeId: m.typeId,
								typeName: m.typeName,
								invitationId: m.invitationId,
								invitationName: m.invitationName,
								closedSession: m.closedSession,
								stage: m.stage,
								reason: reasons.get(m.id)!,
								placedHere: placedHere(m),
								problems: problemOf(m),
							}),
						)
					: null,
			leftOut:
				viewer === 'admin'
					? sortPeople(
							box.exclude.flatMap(id => {
								const p = byId.get(id)
								return p
									? [
											{
												id: p.id,
												code: p.code,
												firstName: p.firstName,
												familyName: p.familyName,
											},
										]
									: []
							}),
						)
					: [],
		},
	}
}

/** Archiving is for admins; printers see an archived badge as printed. */
const forPrinter = (people: ServerPerson[]) =>
	people.map(p =>
		p.stage === 'archived' ? { ...p, stage: 'printed' as const } : p,
	)

/**
 * A printer's events, and what they may see and print there. Like their print
 * queue, they only see participants of the types they're assigned to.
 */
async function printerAccess(userId: string) {
	const [accesses, steps] = await Promise.all([
		prisma.userEventAccess.findMany({
			where: { userId, role: { name: 'printer' } },
			select: { eventId: true },
		}),
		getUserAccessibleStepInfo(userId, ['printer']),
	])
	const types = new Set(steps.participantTypeIds)
	return {
		eventIds: [...new Set(accesses.map(a => a.eventId))],
		readiness: printerReadiness(steps),
		visible: (p: ServerPerson) => types.has(p.typeId),
	}
}

/** The boxes a printer sees: every box in the events they're assigned to. */
export async function loadPrinterView(userId: string, url: URL) {
	const { eventIds, readiness, visible } = await printerAccess(userId)
	const [boxes, people, placements, types] = await Promise.all([
		loadBoxes({ eventId: { in: eventIds } }),
		loadPeople(eventIds).then(forPrinter),
		loadPlacements(eventIds),
		prisma.participantType.findMany({
			where: { events: { some: { eventId: { in: eventIds } } } },
			select: { id: true, name: true },
		}),
	])
	const names = new Map(types.map(t => [t.id, t.name]))
	return buildView({
		viewer: 'printer',
		boxes,
		people,
		placements,
		readiness,
		visible,
		problems: await loadBadgeProblems(people.filter(visible)),
		boxId: url.searchParams.get('box'),
		partKey: url.searchParams.get('part'),
		typeName: id => names.get(id) ?? 'Unknown type',
	})
}

/**
 * The people a printer can print in a box (or one of its smaller boxes) right
 * now, recomputed at submit time so a stale page can't print anyone who moved
 * since.
 */
export async function readyInBox(
	userId: string,
	boxId: string,
	partKey: string | null,
) {
	const { eventIds, readiness, visible } = await printerAccess(userId)
	const target = await prisma.box.findFirst({
		where: { id: boxId, eventId: { in: eventIds } },
		select: { eventId: true },
	})
	if (!target) return null
	const [boxes, people, placements] = await Promise.all([
		loadBoxes({ eventId: target.eventId }),
		loadPeople([target.eventId]).then(forPrinter),
		loadPlacements([target.eventId]),
	])
	const box = boxes.find(b => b.id === boxId)
	if (!box) return null
	const scoped = scopeBox(
		box,
		people,
		placements,
		assign(boxes, people, placements),
		partKey,
		visible,
	)
	const ready = scoped.scope.filter(
		m => readiness(m, box.id, placements) === 'ready',
	)
	const waiting = scoped.scope.filter(
		m => readiness(m, box.id, placements) === 'waiting',
	).length
	return { box, placements, ready, waiting, ...scoped }
}

/**
 * Mark each person's badge printed, as the print queue would. Anyone someone
 * else moved in the meantime is skipped, not failed. Any other error stops the
 * run instead of throwing, so the caller still locks the badges already marked:
 * `failed` counts the people never reached.
 */
export async function printPeople({
	request,
	userId,
	box,
	scopeName,
	people,
}: {
	request: Request
	userId: string
	box: LoadedBox
	scopeName: string
	people: ServerPerson[]
}) {
	const done: ServerPerson[] = []
	let skipped = 0
	let failed = 0
	for (const [i, p] of people.entries()) {
		try {
			await processParticipant(
				p.id,
				userId,
				Action.PRINT,
				`Badge printed with box "${scopeName}"`,
				{ expectedStepId: p.stepId },
			)
		} catch (error) {
			if (isConflict(error)) {
				skipped++
				continue
			}
			console.error(
				`Box print "${scopeName}" stopped at ${p.id} after ${done.length} printed:`,
				error,
			)
			failed = people.length - i
			break
		}
		done.push(p)
		await auditRequest({
			request,
			action: AuditAction.PRINT,
			entityType: AuditEntityType.PARTICIPANT,
			entityId: p.id,
			description: `Printed badge for ${p.firstName} ${p.familyName} with box "${scopeName}"`,
			userId,
			tenantId: p.tenantId,
			metadata: {
				box: { id: box.id, name: box.name, scope: scopeName },
				participant: {
					id: p.id,
					name: `${p.firstName} ${p.familyName}`,
					email: p.email,
					type: p.typeName,
				},
				beforeState: { stepId: p.stepId, status: p.status },
			},
		})
	}
	return { done, skipped, failed }
}

/**
 * Archive printed badges through the workflow engine, one person at a time, so
 * each gets an approval in their history. Archiving changes the status only;
 * the person stays at their step. Like printPeople, anyone someone else moved
 * in the meantime is skipped, and any other error stops the run: `failed`
 * counts the people never reached.
 */
export async function archivePeople({
	request,
	userId,
	box,
	scopeName,
	people,
}: {
	request: Request
	userId: string
	box: LoadedBox
	scopeName: string
	people: ServerPerson[]
}) {
	let done = 0
	let skipped = 0
	let failed = 0
	for (const [i, p] of people.entries()) {
		try {
			await processParticipant(
				p.id,
				userId,
				Action.ARCHIVE,
				`Badge archived with box "${scopeName}"`,
				{ expectedStepId: p.stepId, expectedStatus: p.status },
			)
		} catch (error) {
			if (isConflict(error)) {
				skipped++
				continue
			}
			console.error(
				`Box archive "${scopeName}" stopped at ${p.id} after ${done} archived:`,
				error,
			)
			failed = people.length - i
			break
		}
		done++
		await auditRequest({
			request,
			action: AuditAction.UPDATE,
			entityType: AuditEntityType.PARTICIPANT,
			entityId: p.id,
			description: `Archived badge for ${p.firstName} ${p.familyName} with box "${scopeName}"`,
			userId,
			tenantId: p.tenantId,
			metadata: {
				box: { id: box.id, name: box.name, scope: scopeName },
				beforeState: { stepId: p.stepId, status: p.status },
				afterState: { stepId: p.stepId, status: 'ARCHIVED' },
			},
		})
	}
	return { done, skipped, failed }
}

/**
 * Undo archiving: archived badges go back to Printed. There's no workflow
 * action for this, so it's recorded in the audit log only.
 */
export async function unarchivePeople({
	request,
	userId,
	box,
	scopeName,
	people,
}: {
	request: Request
	userId: string
	box: LoadedBox
	scopeName: string
	people: ServerPerson[]
}) {
	let done = 0
	for (const p of people) {
		const { count } = await prisma.participant.updateMany({
			where: { id: p.id, status: 'ARCHIVED' },
			data: { status: 'PRINTED' },
		})
		if (count === 0) continue
		done++
		await auditRequest({
			request,
			action: AuditAction.UPDATE,
			entityType: AuditEntityType.PARTICIPANT,
			entityId: p.id,
			description: `Unarchived badge for ${p.firstName} ${p.familyName} with box "${scopeName}"`,
			userId,
			tenantId: p.tenantId,
			metadata: {
				box: { id: box.id, name: box.name, scope: scopeName },
				beforeState: { stepId: p.stepId, status: 'ARCHIVED' },
				afterState: { stepId: p.stepId, status: 'PRINTED' },
			},
		})
	}
	return { done, skipped: people.length - done }
}

function isConflict(error: unknown) {
	return error instanceof Response && error.status === 409
}

/** The toast line after a print: where, who was skipped, who's still to do. */
export function actionSummary({
	name,
	skipped,
	left,
}: {
	name: string
	skipped: number
	left: number
}) {
	const parts: string[] = []
	if (skipped)
		parts.push(
			`${skipped} skipped because someone else had already moved them.`,
		)
	if (left > 0)
		parts.push(
			`${left} more ${left === 1 ? 'is' : 'are'} ready. Run the box again for them.`,
		)
	return parts.length ? `${name}. ${parts.join(' ')}` : name
}
