// Adding one participant type to an event after setup: the plan shape and the
// pure helpers the receipt and the server share. No server imports here.
// Decision record: docs/decisions/2026-11-06-event-participant-types.md

import { type SetupContext } from './event-setup'

export const ADD_TYPE_SECTIONS = [
	{
		key: 'workflow',
		title: 'Workflow',
		help: 'The approval workflow this type goes through. Registration only offers the type once it has one.',
	},
	{
		key: 'badge',
		title: 'Badge template',
		help: 'The badge design this type prints on.',
	},
	{
		key: 'access',
		title: 'Staff access',
		help: "Who works on this type's workflow. Only its steps are touched; access to the event's other workflows stays as it is.",
	},
	{
		key: 'quotas',
		title: 'Quotas',
		help: 'Optional quotas for this type in the existing restrictions, and whether invitations get them too.',
	},
] as const

export type AddTypeSectionKey = (typeof ADD_TYPE_SECTIONS)[number]['key']

export type AccessLevel = 'OPEN' | 'CLOSED'

export type AddTypeContext = {
	event: { id: string; name: string }
	/** Types the wizard can add or finish: not on the list yet, or on it but missing a workflow or badge. */
	candidates: {
		id: string
		name: string
		listed: boolean
		missing: ('workflow' | 'badge')[]
	}[]
	/** The type picked on the first step, or null until one is. */
	type: { id: string; name: string } | null
	workflowTemplates: SetupContext['workflowTemplates']
	badgeTemplates: SetupContext['badgeTemplates']
	/** Staff who could work on a step; `eventStep` is the step they work on most in this event. */
	staff: (SetupContext['staff'][number] & { eventStep: string | null })[]
	restrictions: {
		id: string
		name: string
		/** Invitations whose quotas came from this restriction. */
		invitations: number
		/** Access levels this restriction already has a quota for, for this type. */
		existingLevels: AccessLevel[]
	}[]
	/** What the event already has for the picked type. These are kept. */
	existing: {
		workflow: { steps: { name: string; role: string }[] } | null
		badge: boolean
		access: { userId: string; stepName: string }[]
	}
}

export type AddTypeQuota = {
	restrictionId: string
	enabled: boolean
	accessLevel: AccessLevel
	quota: number
}

/** '' means "none" for workflow, badge and stepName. */
export type AddTypePlan = {
	/** Workflow template id; ignored when the type already has a workflow. */
	workflow: string
	/** Badge template id; ignored when the type already has one. */
	badge: string
	access: { userId: string; stepName: string }[]
	quotas: AddTypeQuota[]
	applyToInvitations: boolean
}

/** The steps the type's workflow will have: the existing one, else the chosen template's. */
export function workflowSteps(ctx: AddTypeContext, plan: AddTypePlan) {
	if (ctx.existing.workflow) return ctx.existing.workflow.steps
	return ctx.workflowTemplates.find(t => t.id === plan.workflow)?.steps ?? []
}

export function stepsForStaff(
	ctx: AddTypeContext,
	plan: AddTypePlan,
	userId: string,
) {
	const user = ctx.staff.find(u => u.id === userId)
	if (!user) return []
	return [
		...new Set(
			workflowSteps(ctx, plan)
				.filter(s => user.roles.includes(s.role))
				.map(s => s.name),
		),
	]
}

/**
 * Access for one workflow: what the type's existing workflow already grants,
 * else the step each person works on in the event's other workflows. People
 * with no access in this event start with none, so an admin's removals hold.
 */
export function defaultAccess(ctx: AddTypeContext, templateId: string) {
	const plan = { workflow: templateId } as AddTypePlan
	return ctx.staff
		.filter(u => stepsForStaff(ctx, plan, u.id).length > 0)
		.map(u => {
			const steps = stepsForStaff(ctx, plan, u.id)
			const saved = ctx.existing.access.find(a => a.userId === u.id)?.stepName
			const remembered = saved ?? u.eventStep
			return {
				userId: u.id,
				stepName: remembered && steps.includes(remembered) ? remembered : '',
			}
		})
}

/** Access rows that will actually be written: a step the person's role can work on. */
export function effectiveAccess(ctx: AddTypeContext, plan: AddTypePlan) {
	return plan.access.filter(
		a => a.stepName && stepsForStaff(ctx, plan, a.userId).includes(a.stepName),
	)
}

/** The quota rows that will be written: enabled, and not already in the restriction. */
export function effectiveQuotas(ctx: AddTypeContext, plan: AddTypePlan) {
	return plan.quotas.filter(q => {
		const r = ctx.restrictions.find(x => x.id === q.restrictionId)
		return q.enabled && r && !r.existingLevels.includes(q.accessLevel)
	})
}

export function sectionSkipReason(ctx: AddTypeContext, key: AddTypeSectionKey) {
	if (key === 'workflow' && ctx.existing.workflow)
		return 'This type already has a workflow for this event.'
	if (key === 'badge' && ctx.existing.badge)
		return 'This type already has a badge template for this event.'
	if (key === 'quotas' && ctx.restrictions.length === 0)
		return 'This event has no restrictions yet. Add quotas on the Restrictions tab.'
	if (
		key === 'quotas' &&
		ctx.restrictions.every(r => r.existingLevels.length === 2)
	)
		return 'Every restriction already has open and closed quotas for this type.'
	return null
}

export function summarize(ctx: AddTypeContext, plan: AddTypePlan) {
	const plural = (n: number, one: string, many = `${one}s`) =>
		`${n} ${n === 1 ? one : many}`
	const templateName = ctx.workflowTemplates.find(
		t => t.id === plan.workflow,
	)?.name
	const badgeName = ctx.badgeTemplates.find(t => t.id === plan.badge)?.name
	const access = effectiveAccess(ctx, plan)
	const quotas = effectiveQuotas(ctx, plan)
	const invitations = plan.applyToInvitations
		? quotas.reduce(
				(n, q) =>
					n +
					(ctx.restrictions.find(r => r.id === q.restrictionId)?.invitations ??
						0),
				0,
			)
		: 0
	return {
		workflow: templateName ? `From ${templateName}` : 'No workflow',
		badge: badgeName ?? 'No badge template',
		access:
			access.length === 0
				? 'Nobody'
				: `${plural(access.length, 'staff member')} on ${plural(new Set(access.map(a => a.stepName)).size, 'step')}`,
		quotas:
			quotas.length === 0
				? 'No quotas'
				: `${plural(quotas.length, 'quota')}${invitations ? `, copied to ${plural(invitations, 'invitation')}` : ''}`,
		counts: { access: access.length, quotas: quotas.length, invitations },
	}
}

function comparable(plan: AddTypePlan, key: AddTypeSectionKey) {
	if (key === 'quotas')
		return { quotas: plan.quotas, apply: plan.applyToInvitations }
	return plan[key]
}

export function isSectionChanged(
	plan: AddTypePlan,
	defaults: AddTypePlan,
	key: AddTypeSectionKey,
) {
	return (
		JSON.stringify(comparable(plan, key)) !==
		JSON.stringify(comparable(defaults, key))
	)
}

export function resetSection(
	plan: AddTypePlan,
	defaults: AddTypePlan,
	key: AddTypeSectionKey,
): AddTypePlan {
	if (key === 'quotas')
		return {
			...plan,
			quotas: structuredClone(defaults.quotas),
			applyToInvitations: defaults.applyToInvitations,
		}
	// The access defaults depend on the workflow, so resetting it resets access too.
	if (key === 'workflow')
		return {
			...plan,
			workflow: defaults.workflow,
			access: structuredClone(defaults.access),
		}
	return { ...plan, [key]: structuredClone(defaults[key]) }
}
