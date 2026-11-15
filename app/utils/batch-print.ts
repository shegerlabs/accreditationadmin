// Printing a run of badges as one PDF: box runs and batch reprints share the
// badge shape, the pre-print checks and the confirm dialog. No Prisma here, so
// the client can use it.
import type { BadgeElement } from '~/components/badge-designer'

/** Why a badge would come out wrong if printed now. */
export type BadgeProblems = {
	/** The design has a photo (or there's no design), but there's no photo. */
	noPhoto: boolean
	/** No badge design for the type: the old fixed layout is used. */
	noDesign: boolean
}

export type PrintTemplate = {
	id: string
	name: string
	width: number
	height: number
	borderWidth: number
	borderColor: string
	borderRadius: number
	badgeIdPrefix: string
	elements: BadgeElement[]
}

export type PrintBadge = {
	id: string
	firstName: string
	familyName: string
	title: string | null
	email: string | null
	organization: string
	jobTitle: string
	country: string
	nationality: string
	typeName: string
	eventName: string
	closedSession: boolean
	executiveCouncilClosedSession: boolean
	profileUrl: string
	photoUrl: string
	frontUrl: string
	backUrl: string
	/** Null, or no elements: the badge prints on the old fixed layout. */
	template: PrintTemplate | null
	problems: BadgeProblems
	/** Which reprint this is (1 = first reprint); null for a first print. */
	reprintNumber: number | null
}

/**
 * The old fixed layout, used when a type has no badge design, always has a
 * photo; a designed badge needs one only if it has a photo element.
 */
export function badgeProblems(
	elements: BadgeElement[] | null | undefined,
	hasPhoto: boolean,
): BadgeProblems {
	const legacy = !elements?.length
	const needsPhoto = legacy || elements.some(el => el.type === 'PHOTO')
	return { noPhoto: needsPhoto && !hasPhoto, noDesign: legacy }
}

export function hasProblem(p: BadgeProblems | null | undefined) {
	return !!p && (p.noPhoto || p.noDesign)
}
