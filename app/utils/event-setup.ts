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
		key: 'invitations',
		title: 'Invitations',
		help: 'Which organizations are invited, and the quotas each one gets.',
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

/**
 * A plan value meaning "keep what the event has": the type's current workflow
 * or badge template. Only used when editing a draft's setup.
 */
export const KEEP = '__current'

export type SetupContext = {
	event: { id: string; name: string }
	/**
	 * `create` fills in what the event doesn't have yet and never touches the
	 * rest. `edit` (a draft that has been set up) loads the saved setup and
	 * saves the differences.
	 */
	mode: 'create' | 'edit'
	/**
	 * Edit mode: why something can't be removed or replaced, by id, as a clause
	 * like "Delegate has 2 participants". Empty in create mode.
	 */
	locks: {
		/** participantTypeId -> why it can't be taken off the event's list. */
		typeRemoval: Record<string, string>
		/** participantTypeId -> why its workflow can't be replaced or removed. */
		workflow: Record<string, string>
		/** participantTypeId -> why its badge template can't be removed. */
		badge: Record<string, string>
		/** invitationId -> why it can't be removed. */
		invitation: Record<string, string>
	}
	/** Edit mode: the current workflow's name per participant type, and how many step names each person has. */
	saved: {
		workflowNames: Record<string, string>
		accessSteps: Record<string, number>
	}
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
		/** Create mode: the event's restrictions, offered to invitations when the Restrictions step is skipped. */
		restrictionList: { id: string; name: string }[]
		invitations: number
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

export type SetupInvitation = {
	/** Edit mode: the saved invitation's id; a new one has a client key. */
	key: string
	organization: string
	/** The focal point's name. Optional. */
	name: string
	email: string
	/** A restriction key from the plan (or an existing restriction's id); '' = none. */
	restrictionKey: string
	/** Digits only; '' = no maximum. Kept as text so the field can be cleared. */
	maximumQuota: string
}

export type SetupEmail = { enabled: boolean; subject: string; body: string }

/** '' means "none" in the per-type maps and in access. */
export type SetupPlan = {
	/** The event's participant types, only used while the event has none yet. */
	types: string[]
	restrictions: SetupRestriction[]
	/** Each gets its restriction's quotas copied onto it, as Apply restriction does. */
	invitations: SetupInvitation[]
	/** participantTypeId -> workflowTemplateId, only for types without a workflow yet. */
	workflows: Record<string, string>
	/** participantTypeId -> badgeTemplateId, only for types without a badge template yet. */
	badges: Record<string, string>
	/** Triggers the event has not customised yet. Only ones that differ from the default get saved. */
	emails: Partial<Record<EmailTrigger, SetupEmail>>
	access: { userId: string; stepName: string }[]
}

/** The event's participant types once setup runs: the saved list, or the one being picked. */
export function eventTypeIds(
	ctx: SetupContext,
	plan: Pick<SetupPlan, 'types'>,
) {
	return new Set(
		ctx.mode === 'create' && ctx.existing.typeIds.length > 0
			? ctx.existing.typeIds
			: plan.types,
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

/** The restrictions an invitation can draw on once setup runs. */
export function restrictionChoices(ctx: SetupContext, plan: SetupPlan) {
	if (ctx.mode === 'create' && ctx.existing.restrictions > 0)
		return ctx.existing.restrictionList.map(r => ({ key: r.id, name: r.name }))
	return plan.restrictions.map(r => ({ key: r.key, name: r.name }))
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The invitation's identity for the database's unique key (per event, organization and email). */
const invitationId = (i: { organization: string; email: string }) =>
	`${i.organization.trim().toLowerCase()}|${i.email.trim().toLowerCase()}`

/** Per-invitation problems by key, shown on the row. */
export function invitationProblems(
	ctx: SetupContext,
	plan: Pick<SetupPlan, 'invitations' | 'restrictions'>,
) {
	const out: Record<string, string> = {}
	const choices = new Set(
		restrictionChoices(ctx, plan as SetupPlan).map(r => r.key),
	)
	const first = new Map<string, number>()
	plan.invitations.forEach((i, n) => {
		const id = invitationId(i)
		if (!i.organization.trim()) out[i.key] = 'Organization is required'
		else if (!i.email.trim()) out[i.key] = 'Email is required'
		else if (!EMAIL.test(i.email.trim())) out[i.key] = 'Not a valid email'
		else if (first.has(id))
			out[i.key] = `Same organization and email as row ${first.get(id)! + 1}`
		else if (!/^\d*$/.test(i.maximumQuota.trim()))
			out[i.key] = 'Maximum must be a whole number'
		else if (i.restrictionKey && !choices.has(i.restrictionKey))
			out[i.key] = 'Its restriction was removed. Pick another one.'
		if (!first.has(id)) first.set(id, n)
	})
	return out
}

/**
 * Pasted lines: tab-separated (copied from a spreadsheet) or comma-separated.
 * Columns: organization, focal point, email. Empty lines are skipped.
 */
export function parseInvitationLines(
	text: string,
	restrictionKey: string,
	nextKey: () => string,
): SetupInvitation[] {
	return text
		.split(/\r?\n/)
		.map(l => l.trim())
		.filter(Boolean)
		.map(line => {
			const cells = (
				line.includes('\t') ? line.split('\t') : line.split(',')
			).map(c => c.trim())
			// An email in the second column means there's no focal point name.
			const [organization = '', second = '', third = ''] = cells
			const [name, email] =
				!third && EMAIL.test(second) ? ['', second] : [second, third]
			return {
				key: nextKey(),
				organization,
				name,
				email,
				restrictionKey,
				maximumQuota: '',
			}
		})
}

/** Step names a workflow will have once setup runs, keyed by participant type. */
function effectiveWorkflows(ctx: SetupContext, plan: SetupPlan) {
	const result = new Map<string, { name: string; role: string }[]>()
	if (ctx.mode === 'edit') {
		// Only kept workflows stay; a replaced one gets the template's steps below.
		const ids = eventTypeIds(ctx, plan)
		for (const w of ctx.existing.workflows) {
			if (
				ids.has(w.participantTypeId) &&
				plan.workflows[w.participantTypeId] === KEEP
			)
				result.set(w.participantTypeId, w.steps)
		}
	} else {
		for (const w of ctx.existing.workflows)
			result.set(w.participantTypeId, w.steps)
	}
	for (const [typeId, templateId] of Object.entries(
		forEventTypes(ctx, plan, plan.workflows),
	)) {
		if (!templateId || templateId === KEEP || result.has(typeId)) continue
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
	const restrictionName = new Map(
		restrictionChoices(ctx, plan).map(r => [r.key, r.name]),
	)
	const byRestriction = new Map<string, number>()
	for (const i of plan.invitations) {
		const name = restrictionName.get(i.restrictionKey) ?? 'no restriction'
		byRestriction.set(name, (byRestriction.get(name) ?? 0) + 1)
	}

	return {
		types: `${plural(plan.types.length, 'type')} of ${ctx.assignableTypeIds.length}`,
		restrictions: `${plural(plan.restrictions.length, 'restriction')}, ${plural(constraints, 'quota')}`,
		invitations:
			plan.invitations.length === 0
				? 'None. They can be added on the Invitations tab later.'
				: `${plural(plan.invitations.length, 'invitation')} (${[...byRestriction].map(([k, n]) => `${n} ${k}`).join(', ')})`,
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
	if (key === 'invitations') {
		// Restriction keys are generated too, so compare by restriction position.
		const at = new Map(plan.restrictions.map((r, n) => [r.key, n]))
		return plan.invitations.map(({ key: _key, restrictionKey, ...i }) => ({
			...i,
			restriction: at.get(restrictionKey) ?? restrictionKey,
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
	if (ctx.mode === 'edit') {
		return key === 'access' && ctx.staff.length === 0
			? 'This tenant has no validator, printer or dispatcher accounts yet.'
			: null
	}
	if (key === 'types' && existing.typeIds.length > 0) {
		return `This event already uses ${existing.typeIds.length} participant type${existing.typeIds.length === 1 ? '' : 's'}.`
	}
	if (key === 'restrictions' && existing.restrictions > 0) {
		return `This event already has ${existing.restrictions} restriction${existing.restrictions === 1 ? '' : 's'}. Manage them on the Restrictions tab.`
	}
	if (key === 'invitations' && existing.invitations > 0) {
		return `This event already has ${existing.invitations} invitation${existing.invitations === 1 ? '' : 's'}. Manage them on the Invitations tab.`
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
	plan: Pick<SetupPlan, 'types' | 'invitations'> & {
		restrictions: {
			key?: string
			name: string
			constraints: {
				name: string
				participantTypeId: string
				accessLevel: 'OPEN' | 'CLOSED'
			}[]
		}[]
	},
) {
	const problems: string[] = []
	const editing = ctx.mode === 'edit'
	if (
		(editing || ctx.existing.typeIds.length === 0) &&
		plan.types.length === 0
	) {
		problems.push('Pick at least one participant type for this event.')
	}
	const ids = eventTypeIds(ctx, plan)
	const anyIds = new Set(
		ctx.participantTypes
			.filter(t => !ctx.assignableTypeIds.includes(t.id))
			.map(t => t.id),
	)
	const typeName = (id: string) =>
		ctx.participantTypes.find(t => t.id === id)?.name ?? 'an unknown type'
	if (editing || ctx.existing.restrictions === 0) {
		for (const r of plan.restrictions) {
			for (const c of r.constraints) {
				if (!ids.has(c.participantTypeId) && !anyIds.has(c.participantTypeId))
					problems.push(
						`Quota "${c.name}" in ${r.name} is for ${typeName(c.participantTypeId)}, which this event doesn't use.`,
					)
			}
		}
	}
	if (editing || ctx.existing.invitations === 0) {
		const bad = Object.keys(invitationProblems(ctx, plan as SetupPlan)).length
		if (bad > 0)
			problems.push(
				`${bad} invitation${bad === 1 ? ' needs' : 's need'} fixing on the Invitations step.`,
			)
	}
	if (editing) {
		// These would fail on the database's unique keys halfway through saving.
		const names = plan.restrictions.map(r => r.name.trim())
		for (const name of new Set(names.filter((n, i) => names.indexOf(n) !== i)))
			problems.push(`There are two restrictions called "${name}".`)
		for (const r of plan.restrictions) {
			const seen = new Set<string>()
			for (const c of r.constraints) {
				const slot = `${c.participantTypeId}:${c.accessLevel}`
				if (seen.has(slot))
					problems.push(
						`${r.name} has two ${c.accessLevel === 'OPEN' ? 'open' : 'closed'} session quotas for ${typeName(c.participantTypeId)}.`,
					)
				seen.add(slot)
			}
		}
		const kept = new Set(plan.types)
		for (const [id, reason] of Object.entries(ctx.locks.typeRemoval)) {
			if (ctx.existing.typeIds.includes(id) && !kept.has(id))
				problems.push(`${reason}, so it can't be removed.`)
		}
		const keptInvitations = new Set(plan.invitations.map(i => i.key))
		for (const [id, reason] of Object.entries(ctx.locks.invitation)) {
			if (!keptInvitations.has(id))
				problems.push(`${reason}, so it can't be removed.`)
		}
	}
	return problems
}

/**
 * Edit mode: what saving would change, compared with the saved setup. The
 * server works the same differences out again from the database before writing.
 */
export function diffSetup(
	ctx: SetupContext,
	saved: SetupPlan,
	plan: SetupPlan,
) {
	const before = new Set(saved.types)
	const after = new Set(plan.types)
	const typesAdded = plan.types.filter(id => !before.has(id))
	const typesRemoved = saved.types.filter(id => !after.has(id))

	const savedRestrictions = new Map(saved.restrictions.map(r => [r.key, r]))
	const planKeys = new Set(plan.restrictions.map(r => r.key))
	const restrictions = {
		added: plan.restrictions.filter(r => !savedRestrictions.has(r.key)).length,
		removed: saved.restrictions.filter(r => !planKeys.has(r.key)).length,
		changed: plan.restrictions.filter(r => {
			const s = savedRestrictions.get(r.key)
			return s && JSON.stringify(r) !== JSON.stringify(s)
		}).length,
	}

	const savedInvitations = new Map(saved.invitations.map(i => [i.key, i]))
	const planInvitationKeys = new Set(plan.invitations.map(i => i.key))
	const invitations = {
		added: plan.invitations.filter(i => !savedInvitations.has(i.key)).length,
		removed: saved.invitations.filter(i => !planInvitationKeys.has(i.key))
			.length,
		changed: plan.invitations.filter(i => {
			const s = savedInvitations.get(i.key)
			return s && JSON.stringify(i) !== JSON.stringify(s)
		}).length,
	}

	const hasWorkflow = new Set(
		ctx.existing.workflows.map(w => w.participantTypeId),
	)
	const workflows = { added: 0, replaced: 0, removed: 0 }
	const hasBadge = new Set(ctx.existing.badgeTypeIds)
	const badges = { added: 0, changed: 0, removed: 0 }
	for (const id of plan.types) {
		const w = plan.workflows[id] ?? ''
		if (w !== KEEP) {
			if (hasWorkflow.has(id)) workflows[w ? 'replaced' : 'removed']++
			else if (w) workflows.added++
		}
		const b = plan.badges[id] ?? ''
		if (hasBadge.has(id)) {
			if (b !== (saved.badges[id] ?? KEEP)) badges[b ? 'changed' : 'removed']++
		} else if (b && b !== KEEP) badges.added++
	}

	const emails = EMAIL_TRIGGERS.filter(
		t => JSON.stringify(plan.emails[t]) !== JSON.stringify(saved.emails[t]),
	).length

	const savedStep = new Map(saved.access.map(a => [a.userId, a.stepName]))
	const access = plan.access.filter(
		a => a.stepName !== (savedStep.get(a.userId) ?? ''),
	).length

	return {
		types: { added: typesAdded, removed: typesRemoved },
		restrictions,
		invitations,
		workflows,
		badges,
		emails,
		access,
	}
}

/** How many changes each section has, for the Changed badges and the save button. */
export function editChangeCounts(diff: ReturnType<typeof diffSetup>) {
	const sum = (o: Record<string, number>) =>
		Object.values(o).reduce((a, b) => a + b, 0)
	return {
		types: diff.types.added.length + diff.types.removed.length,
		restrictions: sum(diff.restrictions),
		invitations: sum(diff.invitations),
		workflows: sum(diff.workflows),
		badges: sum(diff.badges),
		emails: diff.emails,
		access: diff.access,
	} satisfies Record<SetupSectionKey, number>
}

export function summarizeEdit(
	ctx: SetupContext,
	saved: SetupPlan,
	plan: SetupPlan,
) {
	const d = diffSetup(ctx, saved, plan)
	const plural = (n: number, one: string, many = `${one}s`) =>
		`${n} ${n === 1 ? one : many}`
	const list = (parts: [number, string][], noun: string) => {
		const said = parts.filter(([n]) => n > 0).map(([n, verb]) => `${n} ${verb}`)
		return said.length === 0 ? '' : `${noun}: ${said.join(', ')}`
	}
	return {
		types:
			d.types.added.length + d.types.removed.length === 0
				? plural(plan.types.length, 'type')
				: [
						d.types.added.length && `${d.types.added.length} added`,
						d.types.removed.length &&
							`${d.types.removed.length} removed, with their workflows and badge templates`,
					]
						.filter(Boolean)
						.join(', '),
		restrictions: list(
			[
				[d.restrictions.added, 'added'],
				[d.restrictions.changed, 'changed'],
				[d.restrictions.removed, 'removed'],
			],
			'Restrictions',
		),
		invitations: list(
			[
				[d.invitations.added, 'added'],
				[d.invitations.changed, 'changed'],
				[d.invitations.removed, 'removed'],
			],
			'Invitations',
		),
		workflows: list(
			[
				[d.workflows.added, 'added'],
				[d.workflows.replaced, 'replaced'],
				[d.workflows.removed, 'removed'],
			],
			'Workflows',
		),
		badges: list(
			[
				[d.badges.added, 'added'],
				[d.badges.changed, 'changed'],
				[d.badges.removed, 'removed'],
			],
			'Badge templates',
		),
		emails: d.emails === 0 ? '' : `${plural(d.emails, 'email')} changed`,
		access:
			d.access === 0
				? ''
				: `Step changed for ${plural(d.access, 'staff member')}`,
		counts: editChangeCounts(d),
	}
}
