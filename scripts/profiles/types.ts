// profiles/types.ts
// The shape of an organ profile, plus the helper used to declare one.
//
// A profile is the ONLY thing that differs between one organ's setup and
// another's: the tenant identity and the participant-type catalogue. Everything
// else (purge, workflow cloning, event creation) is shared by `setup-event`.

import { type Priority } from '@prisma/client'

/**
 * Quota exemptions, named rather than positional.
 *
 * Every flag LOOSENS enforcement, so each defaults to false and a profile only
 * states the ones it means to grant.
 */
export interface QuotaExemptions {
	/** Does not count against the event's overall quota. */
	fromFullQuota?: boolean
	/** Does not count against the open-session quota. */
	fromOpenSessionQuota?: boolean
	/** Does not count against the closed-session quota. */
	fromClosedSessionQuota?: boolean
}

export interface ParticipantTypeSpec {
	name: string
	description: string
	priority: Priority
	isExemptedFromFullQuota: boolean
	isExemptedFromOpenSessionQuota: boolean
	isExemptedFromClosedSessionQuota: boolean
	/**
	 * WorkflowTemplate name used for this type when the operator chooses
	 * "profile defaults" at the workflow prompt. Must match a WorkflowTemplate
	 * row's name; `setup-event` validates this before writing anything.
	 */
	workflowTemplate: string
}

/** Declare one participant type. Shared so profiles cannot drift apart. */
export function participantType(spec: {
	name: string
	description: string
	priority: Priority
	workflowTemplate: string
	exempt?: QuotaExemptions
}): ParticipantTypeSpec {
	const { exempt = {}, ...rest } = spec
	return {
		...rest,
		isExemptedFromFullQuota: exempt.fromFullQuota ?? false,
		isExemptedFromOpenSessionQuota: exempt.fromOpenSessionQuota ?? false,
		isExemptedFromClosedSessionQuota: exempt.fromClosedSessionQuota ?? false,
	}
}

export interface MeetingTypeSpec {
	name: string
	description: string
}

export interface TenantSpec {
	name: string
	email: string
	phone: string
	website?: string
	address?: string
	city?: string
	country?: string
	subscriptionPlan: string
}

export interface SuggestedEvent {
	name: string
	description: string
	/**
	 * Where the event is held.
	 *
	 * The Event model has no location column, so this cannot be stored
	 * structurally. `setup-event` appends it to the description, which is the
	 * only field that carries it through to the UI. Adding a real column would
	 * need a schema change, and this database is not under Prisma Migrate.
	 */
	location?: string
	startDate: string // YYYY-MM-DD, local to utcOffset
	endDate: string // YYYY-MM-DD, local to utcOffset
	utcOffset: string // e.g. '+02:00'
}

export interface OrganProfile {
	/** Stable key used for the --organ flag. */
	key: string
	/** Shown in the interactive picker. */
	label: string
	tenant: TenantSpec
	participantTypes: ParticipantTypeSpec[]
	meetingTypes: MeetingTypeSpec[]
	/** Pre-filled defaults for the event prompts. All are editable at runtime. */
	suggestedEvent?: SuggestedEvent
	/**
	 * Fields the maintainer has not yet confirmed against the real organisation.
	 * `setup-event` prints these as a warning on every run until the list is
	 * emptied, so a placeholder can never reach production unnoticed.
	 */
	unverifiedFields?: string[]
}
