// Boxes: saved groupings of an event's participants that badge printers print
// in bulk. Membership is computed here, never stored, and a person is in one
// box at most (see assignBoxes). Shared by server and client, so no Prisma.
import type { BoxSplit } from '@prisma/client'
import type { BadgeProblems } from './batch-print'

export type BoxViewer = 'printer' | 'admin'

/** Where a participant is in accreditation, as far as boxes care. */
export type Stage =
	| 'review'
	| 'validation'
	| 'print'
	| 'printed'
	| 'archived'
	| 'returned'

export const STAGES: Stage[] = [
	'review',
	'validation',
	'print',
	'printed',
	'archived',
	'returned',
]

export const STAGE_META: Record<
	Stage,
	{ label: string; dot: string; pill: string }
> = {
	review: {
		label: 'In review',
		dot: 'bg-slate-400',
		pill: 'bg-slate-100 text-slate-800',
	},
	validation: {
		label: 'In validation',
		dot: 'bg-orange-400',
		pill: 'bg-orange-100 text-orange-800',
	},
	print: {
		label: 'Awaiting print',
		// A deeper shade of the app's primary (45 25% 70%), which is too pale to
		// read as a status.
		dot: 'bg-[hsl(45_45%_45%)]',
		pill: 'bg-[hsl(45_45%_90%)] text-[hsl(45_50%_25%)]',
	},
	printed: {
		label: 'Printed',
		dot: 'bg-green-500',
		pill: 'bg-green-100 text-green-800',
	},
	archived: {
		label: 'Archived',
		dot: 'bg-purple-500',
		pill: 'bg-purple-100 text-purple-800',
	},
	returned: {
		label: 'Returned for correction',
		dot: 'bg-red-500',
		pill: 'bg-red-100 text-red-800',
	},
}

export const SPLIT_LABEL: Record<BoxSplit, string> = {
	INVITATION: 'Invitation',
	TYPE: 'Participant type',
	SURNAME: 'Surname',
	SIZE: 'Size (fixed number per box)',
}

/**
 * The splits offered when editing a box. INVITATION is no longer offered, but
 * stays in the enum so boxes and printed placements that already use it keep
 * sorting the same way.
 */
export const SPLITS: BoxSplit[] = ['TYPE', 'SURNAME', 'SIZE']

/** Splits that can also cap each smaller box at a number of people. */
export const CAPPABLE: BoxSplit[] = ['TYPE', 'SURNAME']

/** The cap on each smaller box of a type or surname split, if any. */
export function capOf(box: Pick<BoxDef, 'splitBy' | 'maxPerBox'>) {
	return box.splitBy && CAPPABLE.includes(box.splitBy) && box.maxPerBox
		? Math.max(1, box.maxPerBox)
		: null
}

export const NO_INVITATION = 'No invitation'

/** Badges per print run. Every badge, with its photo, renders into one PDF in the browser. */
export const MAX_PER_PRINT = 50

/**
 * Where a box dialog (print, box sheet) goes back to: the box page it was
 * opened from, passed as `back`. Anything else falls back to `fallback`.
 */
export function boxDialogBack(back: string | null, fallback: string) {
	return back && /^\/printer\/boxes(\?|$)/.test(back) ? back : fallback
}

export type BoxPerson = {
	id: string
	code: string
	firstName: string
	familyName: string
	typeId: string
	typeName: string
	invitationId: string | null
	invitationName: string
	closedSession: boolean
	stage: Stage
}

export type BoxDef = {
	id: string
	/** false = hand-picked only. */
	hasRule: boolean
	participantTypeIds: string[]
	closedSessionOnly: boolean
	splitBy: BoxSplit | null
	batchSize: number
	/** Type and surname splits: most people per smaller box, or no limit. */
	maxPerBox: number | null
	include: string[]
	exclude: string[]
}

/**
 * Where a badge physically is: printed through a box, or reserved in a Size
 * batch that froze when a batch-mate printed (`printed: false`). `splitBy` is
 * the split the part key belongs to; when an admin changes the split, the box's
 * placements are re-filed under the new one (see refilePlacements).
 */
export type Placement = {
	boxId: string
	splitBy: BoxSplit | null
	part: string | null
	printed: boolean
}
export type Placements = Record<string, Placement>

/** Why someone is in a box. 'locked': printed here, no longer matches. */
export type Membership = 'rule' | 'manual' | 'locked'

/**
 * A rule with no criteria matches everyone, so the box takes whoever the
 * boxes above it leave.
 */
export function isCatchAll(
	b: Pick<BoxDef, 'hasRule' | 'participantTypeIds' | 'closedSessionOnly'>,
) {
	return b.hasRule && b.participantTypeIds.length === 0 && !b.closedSessionOnly
}

/** Stage never counts: a person keeps their box all through accreditation. */
export function matchesRule(
	p: BoxPerson,
	b: Pick<BoxDef, 'hasRule' | 'participantTypeIds' | 'closedSessionOnly'>,
) {
	if (!b.hasRule) return false
	if (b.participantTypeIds.length && !b.participantTypeIds.includes(p.typeId))
		return false
	if (b.closedSessionOnly && !p.closedSession) return false
	return true
}

export function sortPeople<
	T extends Pick<BoxPerson, 'familyName' | 'firstName'>,
>(ps: T[]) {
	return [...ps].sort(
		(a, b) =>
			a.familyName.localeCompare(b.familyName, undefined, {
				sensitivity: 'base',
			}) ||
			a.firstName.localeCompare(b.firstName, undefined, {
				sensitivity: 'base',
			}),
	)
}

export type Assignment = { boxId: string; reason: Membership }
export type Assignments = Map<string, Assignment>

/**
 * The one box each person is in, for one event's boxes in list order:
 * 1. the box their badge was printed (or reserved) through;
 * 2. else a box they were added to by hand (the first, should there be two);
 * 3. else the first box whose rule matches them and that hasn't left them out.
 */
export function assignBoxes(
	boxes: BoxDef[],
	people: BoxPerson[],
	placements: Placements,
): Assignments {
	const byId = new Map(boxes.map(b => [b.id, b]))
	const sets = boxes.map(b => ({
		box: b,
		include: new Set(b.include),
		exclude: new Set(b.exclude),
	}))
	const out: Assignments = new Map()
	for (const p of people) {
		const placed = placements[p.id] && byId.get(placements[p.id]!.boxId)
		if (placed) {
			const s = sets.find(x => x.box === placed)!
			out.set(p.id, {
				boxId: placed.id,
				reason: s.include.has(p.id)
					? 'manual'
					: !s.exclude.has(p.id) && matchesRule(p, placed)
						? 'rule'
						: 'locked',
			})
			continue
		}
		const picked = sets.find(x => x.include.has(p.id))
		if (picked) {
			out.set(p.id, { boxId: picked.box.id, reason: 'manual' })
			continue
		}
		const ruled = sets.find(x => !x.exclude.has(p.id) && matchesRule(p, x.box))
		if (ruled) out.set(p.id, { boxId: ruled.box.id, reason: 'rule' })
	}
	return out
}

/**
 * A box's members, and how many more its rule matches that are in another
 * box (one above it, or one they were added to by hand).
 */
export function resolveBox<T extends BoxPerson>(
	box: BoxDef,
	people: T[],
	assignments: Assignments,
) {
	const exclude = new Set(box.exclude)
	const reasons = new Map<string, Membership>()
	let inOtherBoxes = 0
	for (const p of people) {
		const a = assignments.get(p.id)
		if (a?.boxId === box.id) reasons.set(p.id, a.reason)
		else if (a && !exclude.has(p.id) && matchesRule(p, box)) inOtherBoxes++
	}
	return {
		members: sortPeople(people.filter(p => reasons.has(p.id))),
		reasons,
		inOtherBoxes,
	}
}

/** People whose badge was printed in another box can't be printed from this one. */
export function badgeIsElsewhere(
	id: string,
	boxId: string,
	placements: Placements,
) {
	const p = placements[id]
	return !!p && p.boxId !== boxId
}

const SURNAME_RANGES: Array<[string, string]> = [
	['A', 'E'],
	['F', 'J'],
	['K', 'O'],
	['P', 'T'],
	['U', 'Z'],
]

function surnameRange(familyName: string) {
	const c = familyName
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.charAt(0)
		.toUpperCase()
	const r = SURNAME_RANGES.find(([a, b]) => c >= a && c <= b)
	return r ? `Surnames ${r[0]}–${r[1]}` : 'Other surnames'
}

const NO_INVITATION_KEY = 'none'

/**
 * Smaller boxes are keyed by id where there is one, so renaming an invitation
 * or a type doesn't strand badges printed under the old name.
 */
function partKey(p: BoxPerson, by: BoxSplit) {
	switch (by) {
		case 'INVITATION':
			return p.invitationId ?? NO_INVITATION_KEY
		case 'TYPE':
			return p.typeId
		case 'SURNAME':
			return surnameRange(p.familyName)
		case 'SIZE':
			return 'All'
	}
}

function partLabel(p: BoxPerson, by: BoxSplit) {
	if (by === 'INVITATION') return p.invitationName
	if (by === 'TYPE') return p.typeName
	return partKey(p, by)
}

/** The current name of a smaller box, from anyone in the event who'd fall in it. */
export function partLabelFor(
	by: BoxSplit | null,
	key: string,
	people: BoxPerson[],
): string {
	if (by !== 'INVITATION' && by !== 'TYPE') return key
	if (by === 'INVITATION' && key === NO_INVITATION_KEY) return NO_INVITATION
	const p = people.find(x => partKey(x, by) === key)
	return p
		? partLabel(p, by)
		: by === 'INVITATION'
			? 'A removed invitation'
			: 'A removed type'
}

/** Where a batch sits, for display: "Media", box 2 of 3, NKURUNZIZA – ZULU. */
export type BatchInfo = {
	/** The type or surname range it was cut from; null for a Size split. */
	group: string | null
	index: number
	of: number
	range: string
}

export type Part<T extends BoxPerson = BoxPerson> = {
	key: string
	/** Flat name, for toasts and the print dialog. */
	label: string
	/** Set when the smaller box is one of a run of numbered batches. */
	batch: BatchInfo | null
	members: T[]
	/** Size batches: printed batch, membership fixed. */
	frozen: boolean
	/** How many members are locked to this smaller box. */
	locked: number
}

function rangeLabel(ms: BoxPerson[]) {
	return ms.length
		? `${ms[0]!.familyName.toUpperCase()} – ${ms[ms.length - 1]!.familyName.toUpperCase()}`
		: 'empty'
}

function batchNumber(key: string | null) {
	const n = Number(key?.replace('Batch ', ''))
	return Number.isInteger(n) && n > 0 ? n : 0
}

/**
 * A capped group's batches are keyed `<group>#<n>`. Group keys are ids or
 * surname ranges, which never contain '#'.
 */
const CAP_SEP = '#'

function cappedKey(group: string, n: number) {
	return `${group}${CAP_SEP}${n}`
}

function groupOf(part: string) {
	const i = part.lastIndexOf(CAP_SEP)
	return i < 0 ? part : part.slice(0, i)
}

function cappedNumber(part: string | null) {
	const i = part?.lastIndexOf(CAP_SEP) ?? -1
	if (!part || i < 0) return 0
	const n = Number(part.slice(i + 1))
	return Number.isInteger(n) && n > 0 ? n : 0
}

/** Whether a placement's part key is in the form the box's split uses now. */
function filedUnder(box: BoxDef, p: Placement) {
	if (p.splitBy !== box.splitBy) return false
	if (!box.splitBy || box.splitBy === 'SIZE') return true
	return cappedNumber(p.part) > 0 === (capOf(box) !== null)
}

function lockedPart(m: BoxPerson, box: BoxDef, placements: Placements) {
	const p = placements[m.id]
	return p && p.boxId === box.id && filedUnder(box, p) ? p.part : null
}

/**
 * Cut people into numbered batches of at most `size`, in surname order.
 * Batches anyone is locked to (`lockedNumber` > 0) keep their people; everyone
 * else is cut into new batches numbered after them.
 */
function cutBatches<T extends BoxPerson>(
	members: T[],
	lockedNumber: (m: T) => number,
	size: number,
) {
	const batches = new Map<number, T[]>()
	const rest: T[] = []
	for (const m of members) {
		const n = lockedNumber(m)
		const batch = n > 0 ? batches.get(n) : undefined
		if (batch) batch.push(m)
		else if (n > 0) batches.set(n, [m])
		else rest.push(m)
	}
	const out = [...batches.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([n, ms]) => ({ n, members: sortPeople(ms), frozen: true }))
	const sorted = sortPeople(rest)
	let n = Math.max(0, ...out.map(b => b.n))
	for (let i = 0; i < sorted.length; i += size)
		out.push({ n: ++n, members: sorted.slice(i, i + size), frozen: false })
	return out
}

/**
 * The smaller boxes a box splits into. Locked people stay in the smaller box
 * they were printed in. Size batches, and the batches of a capped type or
 * surname group, lock whole: once any of a batch prints its members are
 * fixed, and everyone else is cut into new batches numbered after them.
 */
export function splitBox<T extends BoxPerson>(
	box: BoxDef,
	members: T[],
	placements: Placements,
): Part<T>[] {
	if (!box.splitBy) return []
	const by = box.splitBy
	if (by === 'SIZE') {
		const batches = cutBatches(
			members,
			m => batchNumber(lockedPart(m, box, placements)),
			Math.max(1, box.batchSize),
		)
		return batches.map((b, i) => ({
			key: `Batch ${b.n}`,
			label: `${i + 1} of ${batches.length} · ${rangeLabel(b.members)}`,
			batch: {
				group: null,
				index: i + 1,
				of: batches.length,
				range: rangeLabel(b.members),
			},
			members: b.members,
			frozen: b.frozen,
			locked: b.frozen ? b.members.length : 0,
		}))
	}

	const cap = capOf(box)
	const groups = new Map<string, T[]>()
	const labels = new Map<string, string>()
	const locked = new Map<string, number>()
	for (const m of members) {
		const fixed = lockedPart(m, box, placements)
		const k = fixed ? (cap ? groupOf(fixed) : fixed) : partKey(m, by)
		if (fixed && !cap) locked.set(k, (locked.get(k) ?? 0) + 1)
		// A locked person may no longer belong to the group they're filed in,
		// so only someone who does names it.
		if (partKey(m, by) === k) labels.set(k, partLabel(m, by))
		const group = groups.get(k)
		if (group) group.push(m)
		else groups.set(k, [m])
	}
	const labelOf = (k: string) => labels.get(k) ?? partLabelFor(by, k, members)
	const byLabel = (a: { label: string }, b: { label: string }) =>
		a.label.localeCompare(b.label)

	if (!cap)
		return [...groups.entries()]
			.map(([key, ms]) => ({
				key,
				label: labelOf(key),
				batch: null,
				members: sortPeople(ms),
				frozen: false,
				locked: locked.get(key) ?? 0,
			}))
			.sort(byLabel)

	return [...groups.entries()]
		.map(([group, ms]) => ({ group, label: labelOf(group), ms }))
		.sort(byLabel)
		.flatMap(({ group, label, ms }) => {
			const batches = cutBatches(
				ms,
				m => cappedNumber(lockedPart(m, box, placements)),
				cap,
			)
			return batches.map((b, i) => ({
				key: cappedKey(group, b.n),
				label:
					batches.length > 1
						? `${label} · ${i + 1} of ${batches.length} · ${rangeLabel(b.members)}`
						: label,
				batch:
					batches.length > 1
						? {
								group: label,
								index: i + 1,
								of: batches.length,
								range: rangeLabel(b.members),
							}
						: null,
				members: b.members,
				frozen: b.frozen,
				locked: b.frozen ? b.members.length : 0,
			}))
		})
}

/**
 * Placements to write after a print. The people who printed are locked to the
 * box. In a batch (Size, or a capped type or surname group) their batch-mates
 * are reserved there too (printed: false), because the physical box is now
 * theirs. Nobody whose badge lives in another box moves.
 */
export function placementsForPrint(
	box: BoxDef,
	scope: Part[] | null,
	members: BoxPerson[],
	printedIds: Set<string>,
	existing: Placements,
): Placements {
	const out: Placements = {}
	const groups = scope ?? [{ key: '', members }]
	const batched = box.splitBy === 'SIZE' || capOf(box) !== null
	for (const g of groups) {
		const wholeBatch = batched && g.members.some(m => printedIds.has(m.id))
		for (const m of g.members) {
			if (badgeIsElsewhere(m.id, box.id, existing)) continue
			const printed = printedIds.has(m.id)
			if (wholeBatch || printed)
				out[m.id] = {
					boxId: box.id,
					splitBy: box.splitBy,
					part: box.splitBy ? g.key : null,
					printed,
				}
		}
	}
	return out
}

/**
 * New part keys for this box's placements after its split (or whether it has
 * a cap) changes, so locked badges are filed under the split in force. Under
 * Size, or a capped group, re-filed badges go into new frozen batches of their
 * own, in surname order. Returns only the placements that change.
 */
export function refilePlacements(
	box: BoxDef,
	members: BoxPerson[],
	placements: Placements,
): Record<string, { splitBy: BoxSplit | null; part: string | null }> {
	const mine = (m: BoxPerson) => {
		const p = placements[m.id]
		return p && p.boxId === box.id ? p : null
	}
	const stale = members.filter(m => {
		const p = mine(m)
		return p && !filedUnder(box, p)
	})
	const out: Record<string, { splitBy: BoxSplit | null; part: string | null }> =
		{}
	const by = box.splitBy
	const cap = capOf(box)

	if (by === 'SIZE') {
		let n = Math.max(
			0,
			...members.map(m => {
				const p = mine(m)
				return p && filedUnder(box, p) ? batchNumber(p.part) : 0
			}),
		)
		const size = Math.max(1, box.batchSize)
		const sorted = sortPeople(stale)
		for (let i = 0; i < sorted.length; i += size) {
			n++
			for (const m of sorted.slice(i, i + size))
				out[m.id] = { splitBy: 'SIZE', part: `Batch ${n}` }
		}
		return out
	}

	if (!by || !cap) {
		for (const m of stale)
			out[m.id] = { splitBy: by, part: by ? partKey(m, by) : null }
		return out
	}

	// Capped: new batches per group, numbered after the group's locked ones.
	const top = new Map<string, number>()
	for (const m of members) {
		const p = mine(m)
		if (!p?.part || !filedUnder(box, p)) continue
		const g = groupOf(p.part)
		top.set(g, Math.max(top.get(g) ?? 0, cappedNumber(p.part)))
	}
	const staleGroups = new Map<string, BoxPerson[]>()
	for (const m of stale) {
		const g = partKey(m, by)
		staleGroups.set(g, [...(staleGroups.get(g) ?? []), m])
	}
	for (const [g, ms] of staleGroups) {
		let n = top.get(g) ?? 0
		const sorted = sortPeople(ms)
		for (let i = 0; i < sorted.length; i += cap) {
			n++
			for (const m of sorted.slice(i, i + cap))
				out[m.id] = { splitBy: by, part: cappedKey(g, n) }
		}
	}
	return out
}

export function ruleChips(
	box: Pick<
		BoxDef,
		| 'hasRule'
		| 'participantTypeIds'
		| 'closedSessionOnly'
		| 'include'
		| 'exclude'
	>,
	typeName: (id: string) => string,
) {
	const chips: string[] = []
	if (!box.hasRule) chips.push('Hand-picked')
	else {
		if (isCatchAll(box)) chips.push('Everyone not in a box above')
		if (box.participantTypeIds.length)
			chips.push(box.participantTypeIds.map(typeName).sort().join(', '))
		if (box.closedSessionOnly) chips.push('Closed session')
		if (box.include.length) chips.push(`+${box.include.length} added by hand`)
	}
	if (box.exclude.length) chips.push(`−${box.exclude.length} left out`)
	return chips
}

export function countStages(ms: Array<{ stage: Stage }>) {
	const counts = Object.fromEntries(STAGES.map(s => [s, 0])) as Record<
		Stage,
		number
	>
	for (const m of ms) counts[m.stage]++
	return counts
}

export function initials(p: { firstName: string; familyName: string }) {
	return `${p.firstName.charAt(0)}${p.familyName.charAt(0)}`.toUpperCase()
}

// What a box page needs. Built on the server, rendered by ~/components/boxes.

export type PartSummary = {
	key: string
	label: string
	batch: BatchInfo | null
	total: number
	ready: number
	/** Already printed (or archived). */
	done: number
	locked: number
	frozen: boolean
}

export type BoxListItem = {
	id: string
	name: string
	owner: string | null
	eventName: string
	splitBy: BoxSplit | null
	total: number
	ready: number
	done: number
	/** Admins only: everyone in the box is archived. */
	archived: boolean
	parts: PartSummary[]
}

export type ReadyPerson = Pick<
	BoxPerson,
	'id' | 'firstName' | 'familyName' | 'typeName'
>

export type MemberRow = BoxPerson & {
	reason: Membership
	/**
	 * The badge is locked to this box: printed through it, or reserved in a
	 * frozen batch. 'outside' = reserved here, but the badge was printed some
	 * other way (the print queue), so it isn't in the box's pile.
	 */
	placedHere: 'printed' | 'reserved' | 'outside' | null
	/** Why their badge would come out wrong; null if fine or already printed. */
	problems: BadgeProblems | null
}

export type PartCard = PartSummary & {
	stages: Record<Stage, number>
	waiting: number
	manual: number
	readyPeople: ReadyPerson[]
	/** Not printed yet, and their badge would come out wrong. */
	needsFixing: number
}

export type SelectedBox = {
	id: string
	name: string
	owner: string | null
	eventName: string
	chips: string[]
	hasRule: boolean
	participantTypeIds: string[]
	closedSessionOnly: boolean
	splitBy: BoxSplit | null
	batchSize: number
	maxPerBox: number | null
	part: PartSummary | null
	total: number
	stages: Record<Stage, number>
	readyPeople: ReadyPerson[]
	/** Not ready to print yet, and not printed either. */
	waiting: number
	/** Not printed yet, and their badge would come out wrong. */
	needsFixing: number
	lockedHere: number
	/** Badges locked to the whole box, whatever smaller box is open. */
	lockedInBox: number
	/** Matched by this box's rule, but in another box. Admins only. */
	inOtherBoxes: number
	/** Smaller boxes, when the box is split and none is open. */
	parts: PartCard[] | null
	/** The people, when the box isn't split or a smaller box is open. */
	members: MemberRow[] | null
	leftOut: Array<Pick<BoxPerson, 'id' | 'code' | 'firstName' | 'familyName'>>
}

export type BoxesView = {
	boxes: BoxListItem[]
	selected: SelectedBox | null
}
