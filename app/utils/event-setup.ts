// Event setup wizard: the plan shape and the pure helpers the receipt and the
// server share. No server imports here, so the route component can use it.
// Decision record: docs/decisions/2026-11-06-event-setup-wizard.md

import {
	EMAIL_TEMPLATE_DEFAULTS,
	EMAIL_TRIGGERS,
	type EmailTrigger,
} from './participant-email'

export const SETUP_SECTIONS = [
	{
		key: 'types',
		title: 'Participant types',
		help: "Which of the tenant's participant types this event uses. The other steps and the registration form only offer these.",
	},
	{
		key: 'restrictions',
		title: 'Restrictions',
		help: 'Quotas per delegation group. Invitations draw from these.',
	},
	{
		key: 'workflows',
		title: 'Workflows',
		help: 'Which approval workflow each participant type goes through.',
	},
	{
		key: 'badges',
		title: 'Badge templates',
		help: 'Which badge design each participant type prints on.',
	},
	{
		key: 'emails',
		title: 'Emails',
		help: 'Messages sent to participants as their request moves.',
	},
	{
		key: 'access',
		title: 'Staff access',
		help: 'Which step each validator, printer and dispatcher works on.',
	},
] as const

export type SetupSectionKey = (typeof SETUP_SECTIONS)[number]['key']

export type SetupContext = {
	event: { id: string; name: string }
	participantTypes: { id: string; name: string }[]
	/** Types that can get a workflow and a badge: everything except "Any". */
	assignableTypeIds: string[]
	/** The tenant's latest other event with a type list; setup starts from its list. */
	previousEvent: { name: string; typeIds: string[] } | null
	workflowTemplates: {
		id: string
		name: string
		steps: { name: string; role: string }[]
	}[]
	badgeTemplates: { id: string; name: string; isDefault: boolean }[]
	staff: { id: string; username: string; name: string; roles: string[] }[]
	/** What the event already has. Setup never overwrites these. */
	existing: {
		/** The event's participant types. Empty until setup picks them. */
		typeIds: string[]
		restrictions: number
		workflows: {
			participantTypeId: string
			steps: { name: string; role: string }[]
		}[]
		badgeTypeIds: string[]
		emailTriggers: EmailTrigger[]
		accessRows: number
	}
}

export type SetupConstraint = {
	key: string
	name: string
	participantTypeId: string
	accessLevel: 'OPEN' | 'CLOSED'
	quota: number
}

export type SetupRestriction = {
	key: string
	name: string
	constraints: SetupConstraint[]
}

export type SetupEmail = { enabled: boolean; subject: string; body: string }

/** '' means "none" in the per-type maps and in access. */
export type SetupPlan = {
	/** The event's participant types, only used while the event has none yet. */
	types: string[]
	restrictions: SetupRestriction[]
	/** participantTypeId -> workflowTemplateId, only for types without a workflow yet. */
	workflows: Record<string, string>
	/** participantTypeId -> badgeTemplateId, only for types without a badge template yet. */
	badges: Record<string, string>
	/** Triggers the event has not customised yet. Only ones that differ from the default get saved. */
	emails: Partial<Record<EmailTrigger, SetupEmail>>
	access: { userId: string; stepName: string }[]
}

/** The event's participant types once setup runs: the saved list, or the one being picked. */
export function eventTypeIds(ctx: SetupContext, plan: SetupPlan) {
	return new Set(
		ctx.existing.typeIds.length > 0 ? ctx.existing.typeIds : plan.types,
	)
}

/** A per-type map (workflows, badges) narrowed to the event's types. */
export function forEventTypes(
	ctx: SetupContext,
	plan: SetupPlan,
	map: Record<string, string>,
) {
	const ids = eventTypeIds(ctx, plan)
	return Object.fromEntries(Object.entries(map).filter(([id]) => ids.has(id)))
}

/** Step names a workflow will have once setup runs, keyed by participant type. */
function effectiveWorkflows(ctx: SetupContext, plan: SetupPlan) {
	const result = new Map<string, { name: string; role: string }[]>()
	for (const w of ctx.existing.workflows)
		result.set(w.participantTypeId, w.steps)
	for (const [typeId, templateId] of Object.entries(
		forEventTypes(ctx, plan, plan.workflows),
	)) {
		if (!templateId || result.has(typeId)) continue
		const template = ctx.workflowTemplates.find(t => t.id === templateId)
		if (template) result.set(typeId, template.steps)
	}
	return result
}

/** The steps a staff member could be given, from the workflows setup will leave behind. */
export function stepsForUser(
	ctx: SetupContext,
	plan: SetupPlan,
	userId: string,
) {
	const user = ctx.staff.find(u => u.id === userId)
	if (!user) return []
	const names = new Set<string>()
	for (const steps of effectiveWorkflows(ctx, plan).values()) {
		for (const s of steps) if (user.roles.includes(s.role)) names.add(s.name)
	}
	return [...names]
}

/** How many workflows contain a step of this name, i.e. how many access rows it becomes. */
export function workflowsWithStep(
	ctx: SetupContext,
	plan: SetupPlan,
	stepName: string,
) {
	if (!stepName) return 0
	let n = 0
	for (const steps of effectiveWorkflows(ctx, plan).values()) {
		if (steps.some(s => s.name === stepName)) n++
	}
	return n
}

export function summarizePlan(ctx: SetupContext, plan: SetupPlan) {
	const templateName = (id: string) =>
		ctx.workflowTemplates.find(t => t.id === id)?.name ?? id
	const byTemplate = new Map<string, number>()
	for (const id of Object.values(forEventTypes(ctx, plan, plan.workflows))) {
		if (id)
			byTemplate.set(
				templateName(id),
				(byTemplate.get(templateName(id)) ?? 0) + 1,
			)
	}
	const workflows = [...byTemplate.values()].reduce((a, b) => a + b, 0)
	const badges = Object.values(forEventTypes(ctx, plan, plan.badges)).filter(
		Boolean,
	).length
	const constraints = plan.restrictions.reduce(
		(n, r) => n + r.constraints.length,
		0,
	)
	const emailTriggers = EMAIL_TRIGGERS.filter(t => plan.emails[t] !== undefined)
	const emailsOn = emailTriggers.filter(t => plan.emails[t]!.enabled).length
	const emailChanges = emailTriggers.filter(t =>
		isCustomEmail(t, plan.emails[t]!),
	).length
	const people = plan.access.filter(a => a.stepName).length
	const grants = plan.access.reduce(
		(n, a) => n + workflowsWithStep(ctx, plan, a.stepName),
		0,
	)
	const plural = (n: number, one: string, many = `${one}s`) =>
		`${n} ${n === 1 ? one : many}`

	return {
		types: `${plural(plan.types.length, 'type')} of ${ctx.assignableTypeIds.length}`,
		restrictions: `${plural(plan.restrictions.length, 'restriction')}, ${plural(constraints, 'quota')}`,
		workflows:
			workflows === 0
				? 'No new workflows'
				: `${plural(workflows, 'workflow')} (${[...byTemplate].map(([k, n]) => `${n} ${k}`).join(', ')})`,
		badges:
			badges === 0
				? 'No new badge templates'
				: plural(badges, 'badge template'),
		emails:
			emailTriggers.length === 0
				? 'No emails to set'
				: `${emailsOn} of ${emailTriggers.length} on${emailChanges ? `, ${emailChanges} customised` : ''}`,
		access: `${plural(people, 'staff member')}, ${plural(grants, 'step assignment')}`,
		counts: { workflows, badges, constraints, people, grants },
	}
}

/** A missing EmailTemplate row already means "use the default", so only differences are saved. */
export function isCustomEmail(trigger: EmailTrigger, email: SetupEmail) {
	const d = EMAIL_TEMPLATE_DEFAULTS[trigger]
	return (
		email.enabled !== d.enabled ||
		email.subject !== d.subject ||
		email.body !== d.body
	)
}

/** Restrictions compare without their generated row keys. */
function comparable(plan: SetupPlan, key: SetupSectionKey) {
	if (key === 'types') return [...plan.types].sort()
	if (key === 'restrictions') {
		return plan.restrictions.map(r => ({
			name: r.name,
			constraints: r.constraints.map(({ key: _key, ...c }) => c),
		}))
	}
	return plan[key]
}

export function isSectionChanged(
	plan: SetupPlan,
	defaults: SetupPlan,
	key: SetupSectionKey,
) {
	return (
		JSON.stringify(comparable(plan, key)) !==
		JSON.stringify(comparable(defaults, key))
	)
}

export function resetSection(
	plan: SetupPlan,
	defaults: SetupPlan,
	key: SetupSectionKey,
): SetupPlan {
	return { ...plan, [key]: structuredClone(defaults[key]) }
}

/** Why a section has nothing to do, or null when setup will write to it. */
export function sectionSkipReason(ctx: SetupContext, key: SetupSectionKey) {
	const { existing } = ctx
	if (key === 'types' && existing.typeIds.length > 0) {
		return `This event already uses ${existing.typeIds.length} participant type${existing.typeIds.length === 1 ? '' : 's'}.`
	}
	if (key === 'restrictions' && existing.restrictions > 0) {
		return `This event already has ${existing.restrictions} restriction${existing.restrictions === 1 ? '' : 's'}. Manage them on the Restrictions tab.`
	}
	const typeIds =
		existing.typeIds.length > 0 ? existing.typeIds : ctx.assignableTypeIds
	if (
		key === 'workflows' &&
		typeIds.every(id =>
			existing.workflows.some(w => w.participantTypeId === id),
		)
	) {
		return 'Every participant type already has a workflow.'
	}
	if (
		key === 'badges' &&
		typeIds.every(id => existing.badgeTypeIds.includes(id))
	) {
		return 'Every participant type already has a badge template.'
	}
	if (
		key === 'emails' &&
		EMAIL_TRIGGERS.every(t => existing.emailTriggers.includes(t))
	) {
		return 'Every email has already been customised for this event.'
	}
	if (key === 'access' && ctx.staff.length === 0) {
		return 'This tenant has no validator, printer or dispatcher accounts yet.'
	}
	return null
}

/** Plan mistakes that would stop setup, shown on the Confirm step and checked again on the server. */
export function planProblems(
	ctx: SetupContext,
	plan: Pick<SetupPlan, 'types'> & {
		restrictions: {
			name: string
			constraints: { name: string; participantTypeId: string }[]
		}[]
	},
) {
	const problems: string[] = []
	if (ctx.existing.typeIds.length === 0 && plan.types.length === 0) {
		problems.push('Pick at least one participant type for this event.')
	}
	const ids = new Set(
		ctx.existing.typeIds.length > 0 ? ctx.existing.typeIds : plan.types,
	)
	const anyIds = new Set(
		ctx.participantTypes
			.filter(t => !ctx.assignableTypeIds.includes(t.id))
			.map(t => t.id),
	)
	const typeName = (id: string) =>
		ctx.participantTypes.find(t => t.id === id)?.name ?? 'an unknown type'
	if (ctx.existing.restrictions === 0) {
		for (const r of plan.restrictions) {
			for (const c of r.constraints) {
				if (!ids.has(c.participantTypeId) && !anyIds.has(c.participantTypeId))
					problems.push(
						`Quota "${c.name}" in ${r.name} is for ${typeName(c.participantTypeId)}, which this event doesn't use.`,
					)
			}
		}
	}
	return problems
}
