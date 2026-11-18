// Adding participant types to an event after setup: the plan shape and the
// pure helpers the receipt and the server share. No server imports here.
// Decision record: docs/decisions/2026-11-06-event-participant-types.md

import { type SetupContext } from './event-setup'

export const ADD_TYPE_SECTIONS = [
	{
		key: 'workflow',
		title: 'Workflow',
		help: 'The approval workflow each type goes through. Registration only offers a type once it has one.',
	},
	{
		key: 'badge',
		title: 'Badge template',
		help: 'The badge design each type prints on.',
	},
	{
		key: 'access',
		title: 'Staff access',
		help: "Who works on these types' workflows. Only their steps are touched; access to the event's other workflows stays as it is.",
	},
	{
		key: 'quotas',
		title: 'Quotas',
		help: 'Optional quotas for these types in the existing restrictions, and whether invitations get them too.',
	},
] as const

export type AddTypeSectionKey = (typeof ADD_TYPE_SECTIONS)[number]['key']

export type AccessLevel = 'OPEN' | 'CLOSED'

type Steps = { name: string; role: string }[]

/** A picked type and what the event already has for it. These are kept. */
export type PickedType = {
	id: string
	name: string
	existing: {
		workflow: { steps: Steps } | null
		badge: boolean
		access: { userId: string; stepName: string }[]
	}
}

export type AddTypeContext = {
	event: { id: string; name: string }
	/** Types the wizard can add or finish: not on the list yet, or on it but missing a workflow or badge. */
	candidates: {
		id: string
		name: string
		listed: boolean
		missing: ('workflow' | 'badge')[]
	}[]
	/** The types picked on the first step, in name order. Empty until some are. */
	types: PickedType[]
	workflowTemplates: SetupContext['workflowTemplates']
	badgeTemplates: SetupContext['badgeTemplates']
	/** Staff who could work on a step; `eventStep` is the step they work on most in this event. */
	staff: (SetupContext['staff'][number] & { eventStep: string | null })[]
	restrictions: {
		id: string
		name: string
		/** Invitations whose quotas came from this restriction. */
		invitations: number
		/** Access levels this restriction already has a quota for, per picked type id. */
		existingLevels: Record<string, AccessLevel[]>
	}[]
}

export type AddTypeQuota = {
	restrictionId: string
	enabled: boolean
	accessLevel: AccessLevel
	quota: number
}

/** '' means "none" for workflow, badge and stepName. */
export type AddTypePlan = {
	/** Workflow template id per type id; types that already have a workflow are ignored. */
	workflows: Record<string, string>
	/** Badge template id per type id; types that already have one are ignored. */
	badges: Record<string, string>
	/** One step per person, granted on each picked type's workflow that has it. */
	access: { userId: string; stepName: string }[]
	/** One row per restriction, added for each picked type that lacks that level. */
	quotas: AddTypeQuota[]
	applyToInvitations: boolean
}

/** The plan for one type, as the server writes it. */
export type SingleTypePlan = Omit<AddTypePlan, 'workflows' | 'badges'> & {
	workflow: string
	badge: string
}

export function planForType(plan: AddTypePlan, typeId: string): SingleTypePlan {
	const { workflows, badges, ...rest } = plan
	return {
		...rest,
		workflow: workflows[typeId] ?? '',
		badge: badges[typeId] ?? '',
	}
}

/** The steps a type's workflow will have: the existing one, else the chosen template's. */
export function workflowSteps(
	ctx: AddTypeContext,
	workflows: AddTypePlan['workflows'],
	type: PickedType,
): Steps {
	if (type.existing.workflow) return type.existing.workflow.steps
	return (
		ctx.workflowTemplates.find(t => t.id === workflows[type.id])?.steps ?? []
	)
}

/** Steps a person's roles let them work on, across every picked type's workflow. */
export function stepsForStaff(
	ctx: AddTypeContext,
	workflows: AddTypePlan['workflows'],
	userId: string,
) {
	const user = ctx.staff.find(u => u.id === userId)
	if (!user) return []
	return [
		...new Set(
			ctx.types.flatMap(t =>
				workflowSteps(ctx, workflows, t)
					.filter(s => user.roles.includes(s.role))
					.map(s => s.name),
			),
		),
	]
}

/**
 * Access for the picked types' workflows: what an existing one already grants,
 * else the step each person works on in the event's other workflows. People
 * with no access in this event start with none, so an admin's removals hold.
 */
export function defaultAccess(
	ctx: AddTypeContext,
	workflows: AddTypePlan['workflows'],
) {
	return ctx.staff.flatMap(u => {
		const steps = stepsForStaff(ctx, workflows, u.id)
		if (steps.length === 0) return []
		const saved = ctx.types
			.flatMap(t => t.existing.access)
			.find(a => a.userId === u.id)?.stepName
		const remembered = saved ?? u.eventStep
		return [
			{
				userId: u.id,
				stepName: remembered && steps.includes(remembered) ? remembered : '',
			},
		]
	})
}

/** Access rows that will actually be written: a step the person's role can work on. */
export function effectiveAccess(ctx: AddTypeContext, plan: AddTypePlan) {
	return plan.access.filter(
		a =>
			a.stepName &&
			stepsForStaff(ctx, plan.workflows, a.userId).includes(a.stepName),
	)
}

/** Picked types that would get this quota: those without one at its level. */
export function typesForQuota(ctx: AddTypeContext, q: AddTypeQuota) {
	const r = ctx.restrictions.find(x => x.id === q.restrictionId)
	if (!r) return []
	return ctx.types.filter(
		t => !(r.existingLevels[t.id] ?? []).includes(q.accessLevel),
	)
}

/** Levels a restriction can still get a quota at, for at least one picked type. */
export function openLevels(
	ctx: AddTypeContext,
	r: AddTypeContext['restrictions'][number],
) {
	return (['OPEN', 'CLOSED'] as const).filter(l =>
		ctx.types.some(t => !(r.existingLevels[t.id] ?? []).includes(l)),
	)
}

/** The quota rows that will be written: enabled, and missing for at least one type. */
export function effectiveQuotas(ctx: AddTypeContext, plan: AddTypePlan) {
	return plan.quotas.filter(q => q.enabled && typesForQuota(ctx, q).length > 0)
}

export function sectionSkipReason(ctx: AddTypeContext, key: AddTypeSectionKey) {
	const one = ctx.types.length === 1
	if (key === 'workflow' && ctx.types.every(t => t.existing.workflow))
		return one
			? 'This type already has a workflow for this event.'
			: 'These types already have workflows for this event.'
	if (key === 'badge' && ctx.types.every(t => t.existing.badge))
		return one
			? 'This type already has a badge template for this event.'
			: 'These types already have badge templates for this event.'
	if (key === 'quotas' && ctx.restrictions.length === 0)
		return 'This event has no restrictions yet. Add quotas on the Restrictions tab.'
	if (
		key === 'quotas' &&
		ctx.restrictions.every(r => openLevels(ctx, r).length === 0)
	)
		return one
			? 'Every restriction already has open and closed quotas for this type.'
			: 'Every restriction already has open and closed quotas for these types.'
	return null
}

const plural = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`

export function summarize(ctx: AddTypeContext, plan: AddTypePlan) {
	const needWorkflow = ctx.types.filter(t => !t.existing.workflow)
	const templateNames = [
		...new Set(
			needWorkflow.flatMap(t => {
				const name = ctx.workflowTemplates.find(
					x => x.id === plan.workflows[t.id],
				)?.name
				return name ? [name] : []
			}),
		),
	]
	const newWorkflows = needWorkflow.filter(t => plan.workflows[t.id]).length
	const needBadge = ctx.types.filter(t => !t.existing.badge)
	const badgeNames = [
		...new Set(
			needBadge.flatMap(t => {
				const name = ctx.badgeTemplates.find(
					x => x.id === plan.badges[t.id],
				)?.name
				return name ? [name] : []
			}),
		),
	]
	const newBadges = needBadge.filter(t => plan.badges[t.id]).length
	const access = effectiveAccess(ctx, plan)
	const quotas = effectiveQuotas(ctx, plan)
	const quotaRows = quotas.reduce((n, q) => n + typesForQuota(ctx, q).length, 0)
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
		workflow:
			newWorkflows === 0
				? 'No workflow'
				: needWorkflow.length === 1
					? `From ${templateNames[0]}`
					: `${plural(newWorkflows, 'workflow')} from ${templateNames.join(', ')}`,
		badge:
			newBadges === 0
				? 'No badge template'
				: needBadge.length === 1
					? badgeNames[0]!
					: `${plural(newBadges, 'badge template')} from ${badgeNames.join(', ')}`,
		access:
			access.length === 0
				? 'Nobody'
				: `${plural(access.length, 'staff member')} on ${plural(new Set(access.map(a => a.stepName)).size, 'step')}`,
		quotas:
			quotaRows === 0
				? 'No quotas'
				: `${plural(quotaRows, 'quota')}${invitations ? `, copied to ${plural(invitations, 'invitation')}` : ''}`,
		counts: { access: access.length, quotas: quotaRows, invitations },
	}
}

function comparable(plan: AddTypePlan, key: AddTypeSectionKey) {
	if (key === 'quotas')
		return { quotas: plan.quotas, apply: plan.applyToInvitations }
	if (key === 'workflow') return plan.workflows
	if (key === 'badge') return plan.badges
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
	// The access defaults depend on the workflows, so resetting them resets access too.
	if (key === 'workflow')
		return {
			...plan,
			workflows: structuredClone(defaults.workflows),
			access: structuredClone(defaults.access),
		}
	if (key === 'badge')
		return { ...plan, badges: structuredClone(defaults.badges) }
	return { ...plan, access: structuredClone(defaults.access) }
}
