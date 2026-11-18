// Changing the workflows of a running event across many workflows at once:
// add a step, remove one, or restore a retired one. Plans are built from
// choices (no prompting here), shown, and applied in one transaction with the
// rules in step-lifecycle-core.server.ts.
//
// Shared by the setup wizard (admin/events/$eventId/setup/workflows) and
// `npm run setup-event -- --workflows`. Keep it free of Remix and `~/` imports.
// Decision record: docs/decisions/2026-11-16-changing-workflows-mid-event.md

import { createHash } from 'node:crypto'
import {
	AuditAction,
	AuditEntityType,
	type Action,
	type Prisma,
	type RequestStatus,
} from '@prisma/client'
import {
	AUTO_ACTIONS,
	ENTRY_STEP_NAME,
	LIFECYCLE_STEP_SELECT,
	insertStepAfterTx,
	moveParticipantsTx,
	moveRemarks,
	planRestore,
	plural,
	removeBlocker,
	removeStepTx,
	restoreStepTx,
} from './step-lifecycle-core.server'
import { workflowNameFromTemplate } from './workflow-clone.server'

type Db = Prisma.TransactionClient

export const WORKFLOW_CHANGE_TRANSACTION = { maxWait: 30_000, timeout: 300_000 }

/** Actions a step added here may have. REJECT/BYPASS are wired as targets, not inserted. */
export const INSERTABLE_ACTIONS: Action[] = [
	'APPROVE',
	'NOTIFY',
	'PRINT',
	'COLLECT',
	'ARCHIVE',
]

const STEP_SELECT = {
	...LIFECYCLE_STEP_SELECT,
	roleId: true,
	role: { select: { name: true } },
	_count: { select: { participants: true, approvals: true } },
} satisfies Prisma.StepSelect

export type WfStep = Prisma.StepGetPayload<{ select: typeof STEP_SELECT }>
export type Wf = { id: string; name: string; typeName: string; steps: WfStep[] }
export type ChangeEvent = { id: string; name: string; tenantId: string }

// --- Reading ---------------------------------------------------------------

export async function loadEventWorkflows(db: Db, eventId: string) {
	const rows = await db.workflow.findMany({
		where: { eventId },
		select: {
			id: true,
			name: true,
			participantType: { select: { name: true } },
			steps: { select: STEP_SELECT, orderBy: { order: 'asc' } },
		},
		orderBy: { participantType: { name: 'asc' } },
	})
	return rows.map(
		(r): Wf => ({
			id: r.id,
			name: r.name,
			typeName: r.participantType.name,
			steps: r.steps,
		}),
	)
}

export const activeSteps = (wf: Wf) => wf.steps.filter(s => !s.retiredAt)

/** The steps a participant walks through, entry first, following nextStepId. */
export function chain(wf: Wf): WfStep[] {
	const steps = activeSteps(wf)
	const byId = new Map(steps.map(s => [s.id, s]))
	let current: WfStep | undefined =
		steps.find(s => s.order === 1) ??
		steps.find(s => s.name === ENTRY_STEP_NAME) ??
		steps[0]
	const seen = new Set<string>()
	const out: WfStep[] = []
	while (current && !seen.has(current.id)) {
		seen.add(current.id)
		out.push(current)
		current = current.nextStepId ? byId.get(current.nextStepId) : undefined
	}
	return out
}

/** Workflows grouped by the steps they walk through, for an overview. */
export function workflowShapes(workflows: Wf[]) {
	const byShape = new Map<
		string,
		{ steps: string[]; offChain: string[]; typeNames: string[] }
	>()
	for (const wf of workflows) {
		const steps = chain(wf)
		const onChain = new Set(steps.map(s => s.id))
		const offChain = activeSteps(wf)
			.filter(s => !onChain.has(s.id))
			.map(s => s.name)
		const key = JSON.stringify([steps.map(s => s.name), offChain])
		const shape = byShape.get(key) ?? {
			steps: steps.map(s => s.name),
			offChain,
			typeNames: [],
		}
		shape.typeNames.push(wf.typeName)
		byShape.set(key, shape)
	}
	return [...byShape.values()].map(s => ({
		...s,
		every: s.typeNames.length === workflows.length,
	}))
}

export function countBy(values: string[]) {
	const m = new Map<string, number>()
	for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
	return m
}

/** Retired step names with how many of the workflows have one. */
export function retiredStepCounts(workflows: Wf[]) {
	return countBy(
		workflows.flatMap(w => [
			...new Set(w.steps.filter(s => s.retiredAt).map(s => s.name)),
		]),
	)
}

// --- Add -------------------------------------------------------------------

export type StepSpec = {
	name: string
	action: Action
	roleId: string
	roleName: string
	requiresAssignment: boolean
	slaDurationMinutes: number | null
}

/** Template steps that can be copied in, with the step they follow in their template. */
export async function templateStepOptions(
	db: Db,
	tenantId: string,
	chosen: Wf[],
) {
	const templates = await db.workflowTemplate.findMany({
		where: { tenantId },
		select: {
			name: true,
			steps: {
				select: {
					id: true,
					name: true,
					action: true,
					order: true,
					roleId: true,
					nextStepId: true,
					requiresAssignment: true,
					slaDurationMinutes: true,
					role: { select: { name: true } },
				},
				orderBy: { order: 'asc' },
			},
		},
		orderBy: { name: 'asc' },
	})
	return templates.flatMap(t =>
		t.steps
			.filter(s => s.order !== 1 && !AUTO_ACTIONS.includes(s.action))
			.map(s => ({
				id: s.id,
				templateName: t.name,
				step: {
					name: s.name,
					action: s.action,
					roleId: s.roleId,
					roleName: s.role.name,
					requiresAssignment: s.requiresAssignment,
					slaDurationMinutes: s.slaDurationMinutes,
				} satisfies StepSpec,
				suggestedAfter: t.steps.find(p => p.nextStepId === s.id)?.name ?? null,
				inEveryChosen: chosen.every(w =>
					activeSteps(w).some(a => a.name === s.name),
				),
			})),
	)
}

/** Steps a new one can follow, with how many of the chosen workflows walk through them. */
export function afterStepOptions(chosen: Wf[]) {
	return [
		...countBy(
			chosen.flatMap(w =>
				chain(w)
					.filter(s => !AUTO_ACTIONS.includes(s.action))
					.map(s => s.name),
			),
		),
	].map(([name, count]) => ({ name, count }))
}

export type AddItem = { wf: Wf; after: WfStep; oldNext: WfStep | null }
export type Skip = { wf: Wf; reason: string }
/** A workflow that once had the step and retired it: adding puts that one back. */
export type AddRestore = {
	wf: Wf
	step: WfStep
	preview: Awaited<ReturnType<typeof planRestore>>
}

/**
 * Where the step goes in each chosen workflow. A workflow holding a retired
 * step of the same name, action and role gets that step back (`retired`, see
 * planAddRestores) rather than a second copy, so its history stays in one place.
 */
export function addItems(chosen: Wf[], step: StepSpec, afterName: string) {
	const items: AddItem[] = []
	const retired: { wf: Wf; step: WfStep }[] = []
	const skipped: Skip[] = []
	for (const wf of chosen) {
		const steps = activeSteps(wf)
		const after = chain(wf).find(s => s.name === afterName)
		const same = (s: WfStep) =>
			s.name === step.name &&
			s.roleId === step.roleId &&
			s.action === step.action
		// The most recently retired one, if it was retired twice.
		const old = wf.steps
			.filter(s => s.retiredAt && same(s))
			.sort((a, b) => b.retiredAt!.getTime() - a.retiredAt!.getTime())[0]
		if (steps.some(s => s.name === step.name))
			skipped.push({ wf, reason: `already has "${step.name}"` })
		else if (old) retired.push({ wf, step: old })
		else if (!after) skipped.push({ wf, reason: `has no "${afterName}"` })
		else if (AUTO_ACTIONS.includes(after.action))
			skipped.push({ wf, reason: `"${afterName}" is not a step to follow` })
		else
			items.push({
				wf,
				after,
				oldNext: steps.find(s => s.id === after.nextStepId) ?? null,
			})
	}
	return { items, retired, skipped }
}

/** Plan putting back the retired steps addItems found; ones with no place left are skipped. */
export async function planAddRestores(
	db: Db,
	retired: { wf: Wf; step: WfStep }[],
) {
	const restores: AddRestore[] = []
	const skipped: Skip[] = []
	for (const r of retired) {
		const preview = await planRestore(db, r.step)
		if (preview.relink.length) restores.push({ ...r, preview })
		else
			skipped.push({
				wf: r.wf,
				reason: `has a retired "${r.step.name}" whose place has changed since; restore it from the workflow's own page`,
			})
	}
	return { restores, skipped }
}

/** Active users with the step's role, marking those who work on the step it follows. */
export async function staffForStep(
	db: Db,
	event: ChangeEvent,
	roleId: string,
	afterName: string,
) {
	const staff = await db.user.findMany({
		where: {
			tenantId: event.tenantId,
			status: 'ACTIVE',
			roles: { some: { id: roleId } },
		},
		select: {
			id: true,
			username: true,
			name: true,
			eventAccess: {
				where: { eventId: event.id, step: { name: afterName } },
				select: { id: true },
				take: 1,
			},
		},
		orderBy: { username: 'asc' },
	})
	return staff.map(u => ({
		id: u.id,
		username: u.username,
		name: u.name,
		worksOnAfter: u.eventAccess.length > 0,
	}))
}

/** Participants already past the insertion point, by status. */
export async function moveBackOptions(
	db: Db,
	items: AddItem[],
	restores: AddRestore[] = [],
) {
	const nextIds = [
		...items.flatMap(i => (i.oldNext ? [i.oldNext.id] : [])),
		...restores.flatMap(r => (r.preview.next ? [r.preview.next.id] : [])),
	]
	if (nextIds.length === 0) return []
	const byStatus = await db.participant.groupBy({
		by: ['status'],
		where: { stepId: { in: nextIds }, deletedAt: null },
		_count: { _all: true },
	})
	return byStatus
		.map(s => ({ status: s.status, count: s._count._all }))
		.sort((a, b) => b.count - a.count)
}

export type AddPlan = {
	kind: 'add'
	step: StepSpec
	afterName: string
	items: AddItem[]
	/** Workflows that get their retired copy of the step back instead. */
	restores: AddRestore[]
	skipped: Skip[]
	grants: { id: string; label: string }[]
	/** Move participants already at the old next step back onto the new one. */
	moveBack: RequestStatus[]
	moveBackCount: number
}

// --- Remove ----------------------------------------------------------------

/** Active step names with how many of the chosen workflows have one. */
export function removableStepOptions(chosen: Wf[]) {
	return [...countBy(chosen.flatMap(w => activeSteps(w).map(s => s.name)))].map(
		([name, count]) => ({ name, count }),
	)
}

/** Where participants waiting at a removed step go. */
export type RemoveTarget =
	| { kind: 'next' }
	| { kind: 'skip' }
	| { kind: 'step'; name: string }

export type RemovePlan = {
	kind: 'remove'
	stepName: string
	items: { wf: Wf; step: WfStep; moveTo: WfStep | null }[]
	skipped: Skip[]
}

/** The steps that can be removed, and how many participants wait at them. */
export function removeCandidates(chosen: Wf[], stepName: string) {
	const skipped: Skip[] = []
	const removable: { wf: Wf; step: WfStep }[] = []
	for (const wf of chosen) {
		const step = activeSteps(wf).find(s => s.name === stepName)
		if (!step) {
			skipped.push({ wf, reason: `has no "${stepName}"` })
			continue
		}
		// Entry and target steps are refused whatever happens to the participants.
		const blocker = removeBlocker(step, { participants: 0 })
		if (blocker) skipped.push({ wf, reason: blocker })
		else removable.push({ wf, step })
	}
	const waiting = removable.reduce((n, f) => n + f.step._count.participants, 0)
	const otherSteps = [
		...countBy(
			removable.flatMap(f =>
				chain(f.wf)
					.filter(s => s.id !== f.step.id && !AUTO_ACTIONS.includes(s.action))
					.map(s => s.name),
			),
		),
	].map(([name, count]) => ({ name, count }))
	return { removable, skipped, waiting, otherSteps }
}

export function buildRemovePlan(
	chosen: Wf[],
	stepName: string,
	target: RemoveTarget,
): RemovePlan {
	const { removable, skipped } = removeCandidates(chosen, stepName)
	const items: RemovePlan['items'] = []
	for (const { wf, step } of removable) {
		const n = step._count.participants
		if (n === 0) {
			items.push({ wf, step, moveTo: null })
			continue
		}
		const moveTo =
			target.kind === 'skip'
				? undefined
				: target.kind === 'next'
					? activeSteps(wf).find(s => s.id === step.nextStepId)
					: chain(wf).find(s => s.name === target.name && s.id !== step.id)
		if (!moveTo || AUTO_ACTIONS.includes(moveTo.action))
			skipped.push({
				wf,
				reason:
					target.kind === 'skip'
						? `${plural(n, 'participant')} still there`
						: `${plural(n, 'participant')} there and nowhere to move them`,
			})
		else items.push({ wf, step, moveTo })
	}
	return { kind: 'remove', stepName, items, skipped }
}

// --- Restore ---------------------------------------------------------------

export type RestorePlan = {
	kind: 'restore'
	stepName: string
	items: {
		wf: Wf
		step: WfStep
		preview: Awaited<ReturnType<typeof planRestore>>
	}[]
	skipped: Skip[]
}

export async function buildRestorePlan(
	db: Db,
	chosen: Wf[],
	stepName: string,
): Promise<RestorePlan> {
	const items: RestorePlan['items'] = []
	const skipped: Skip[] = []
	for (const wf of chosen) {
		// The most recently retired one, if a step of that name was retired twice.
		const step = wf.steps
			.filter(s => s.retiredAt && s.name === stepName)
			.sort((a, b) => b.retiredAt!.getTime() - a.retiredAt!.getTime())[0]
		if (!step) skipped.push({ wf, reason: `has no retired "${stepName}"` })
		else if (activeSteps(wf).some(s => s.name === stepName))
			skipped.push({ wf, reason: `already has an active "${stepName}"` })
		else items.push({ wf, step, preview: await planRestore(db, step) })
	}
	return { kind: 'restore', stepName, items, skipped }
}

export type WorkflowChangePlan = AddPlan | RemovePlan | RestorePlan

/** How many workflows the plan changes. */
export const planSize = (plan: WorkflowChangePlan) =>
	plan.items.length + (plan.kind === 'add' ? plan.restores.length : 0)

// --- Showing ---------------------------------------------------------------

/** The plan as plain text: a headline, one line per workflow, notes and skips. */
export function describePlan(plan: WorkflowChangePlan) {
	const rows: { typeName: string; text: string }[] = []
	const notes: string[] = []
	let title: string
	if (plan.kind === 'add') {
		const s = plan.step
		title = `Add "${s.name}" (${s.action}, ${s.roleName}) after "${plan.afterName}" in ${plural(planSize(plan), 'workflow')}`
		for (const i of plan.items)
			rows.push({
				typeName: i.wf.typeName,
				text: `${i.after.name} → ${s.name} → ${i.oldNext?.name ?? '(end)'}`,
			})
		for (const r of plan.restores)
			rows.push({
				typeName: r.wf.typeName,
				text: `Restore the retired "${s.name}" where it was: ${r.preview.relink.map(p => p.name).join(', ')} → ${s.name} → ${r.preview.next?.name ?? '(end)'}`,
			})
		notes.push(
			`Access: ${plan.grants.length ? plan.grants.map(g => g.label).join(', ') : s.requiresAssignment ? 'nobody yet. Without access nobody sees the participants waiting there' : 'not needed'}.`,
		)
		notes.push(
			plan.moveBack.length
				? `Move back: ${plural(plan.moveBackCount, 'participant')} (${plan.moveBack.join(', ')}) to "${s.name}".`
				: 'Move back: nobody. Participants past this point carry on as they are.',
		)
		notes.push(
			`Participants still before "${s.name}" go through it when they are next approved.`,
		)
	} else if (plan.kind === 'remove') {
		title = `Remove "${plan.stepName}" from ${plural(plan.items.length, 'workflow')}`
		for (const i of plan.items) {
			const n = i.step._count.participants
			const next = i.wf.steps.find(s => s.id === i.step.nextStepId)
			rows.push({
				typeName: i.wf.typeName,
				text:
					'Retire (can be restored)' +
					`; steps before it now lead to ${next ? `"${next.name}"` : '(end)'}` +
					(n
						? `; move ${plural(n, 'participant')} to "${i.moveTo!.name}"`
						: ''),
			})
		}
	} else {
		title = `Restore "${plan.stepName}" in ${plural(plan.items.length, 'workflow')}`
		for (const i of plan.items) {
			const p = i.preview
			rows.push({
				typeName: i.wf.typeName,
				text:
					`${p.relink.length ? `${p.relink.map(r => r.name).join(', ')} → ` : '(nothing relinked) '}${plan.stepName} → ${p.next?.name ?? '(end)'}` +
					(p.grantNames.length
						? `; access back for ${p.grantNames.join(', ')}`
						: '') +
					(p.notRelinked.length
						? `; ${p.notRelinked.map(r => r.name).join(', ')} changed since, left alone`
						: ''),
			})
		}
	}
	return {
		title,
		rows,
		notes,
		skipped: plan.skipped.map(s => ({
			typeName: s.wf.typeName,
			reason: s.reason,
		})),
	}
}

/**
 * Identifies what a plan would write. A page shows a plan, then rebuilds it
 * when the change is submitted; a different fingerprint means the workflows
 * changed in between, and the change is refused rather than applied unseen.
 */
export function planFingerprint(plan: WorkflowChangePlan) {
	const parts =
		plan.kind === 'add'
			? [
					plan.step,
					plan.items.map(i => [i.wf.id, i.after.id, i.oldNext?.id ?? null]),
					plan.restores.map(r => [
						r.step.id,
						r.preview.relink.map(p => p.id),
						r.preview.next?.id ?? null,
					]),
					plan.grants.map(g => g.id),
					plan.moveBack,
					plan.moveBackCount,
				]
			: plan.kind === 'remove'
				? plan.items.map(i => [
						i.step.id,
						i.step._count.participants,
						i.step._count.approvals,
						i.moveTo?.id ?? null,
					])
				: plan.items.map(i => [i.step.id, i.preview.relink.map(r => r.id)])
	return createHash('sha256')
		.update(JSON.stringify([plan.kind, parts]))
		.digest('hex')
		.slice(0, 16)
}

// --- Writing ---------------------------------------------------------------

/**
 * Apply a plan inside the caller's transaction, with one audit log per
 * workflow, then rename workflows whose steps now match a different template
 * (see syncTemplateNamesTx). Returns a one-line summary and counts.
 */
export async function applyWorkflowChange(
	tx: Db,
	args: {
		event: ChangeEvent
		plan: WorkflowChangePlan
		actorId: string
		ipAddress?: string
		userAgent: string
	},
) {
	const result = await applyPlanTx(tx, args)
	const renamed = await syncTemplateNamesTx(tx, args)
	return {
		...result,
		summary:
			result.summary +
			(renamed.length
				? ` Renamed ${plural(renamed.length, 'workflow')} to match ${[...new Set(renamed.map(r => `"${r.templateName}"`))].join(', ')}.`
				: ''),
		renamed,
	}
}

/** Active steps as a comparable signature: the set of name and action pairs. */
const stepSignature = (steps: { name: string; action: Action }[]) =>
	JSON.stringify(steps.map(s => `${s.action}:${s.name}`).sort())

/**
 * A workflow cloned from a template is named "<Type> - <Template>". Once steps
 * are added or removed that name can describe the wrong template ("One Level
 * Approval" on a workflow that now has two validation levels). Rename every
 * workflow of the event that still carries such a name to the one template
 * whose steps its active steps match exactly. Workflows with names of their
 * own, or that match no template (or several), keep their name.
 */
export async function syncTemplateNamesTx(
	tx: Db,
	{
		event,
		actorId,
		ipAddress,
		userAgent,
	}: {
		event: ChangeEvent
		actorId: string
		ipAddress?: string
		userAgent: string
	},
) {
	const templates = await tx.workflowTemplate.findMany({
		where: { tenantId: event.tenantId },
		select: { name: true, steps: { select: { name: true, action: true } } },
	})
	const bySignature = new Map<string, string[]>()
	for (const t of templates) {
		const key = stepSignature(t.steps)
		bySignature.set(key, [...(bySignature.get(key) ?? []), t.name])
	}
	const renamed: {
		id: string
		from: string
		to: string
		templateName: string
	}[] = []
	for (const wf of await loadEventWorkflows(tx, event.id)) {
		const conventional = templates.some(
			t => wf.name === workflowNameFromTemplate(wf.typeName, t.name),
		)
		if (!conventional) continue
		const matches = bySignature.get(stepSignature(activeSteps(wf))) ?? []
		if (matches.length !== 1) continue
		const to = workflowNameFromTemplate(wf.typeName, matches[0]!)
		if (to === wf.name) continue
		await tx.workflow.update({ where: { id: wf.id }, data: { name: to } })
		await tx.auditLog.create({
			data: {
				tenantId: event.tenantId,
				userId: actorId,
				action: AuditAction.UPDATE,
				entityType: AuditEntityType.WORKFLOW,
				entityId: wf.id,
				description: `Renamed workflow "${wf.name}" to "${to}" in event "${event.name}": its steps now match the "${matches[0]}" template`,
				metadata: { eventId: event.id, from: wf.name, to },
				ipAddress,
				userAgent,
			},
		})
		renamed.push({ id: wf.id, from: wf.name, to, templateName: matches[0]! })
	}
	return renamed
}

async function applyPlanTx(
	tx: Db,
	{
		event,
		plan,
		actorId,
		ipAddress,
		userAgent,
	}: {
		event: ChangeEvent
		plan: WorkflowChangePlan
		actorId: string
		ipAddress?: string
		userAgent: string
	},
) {
	const audit = (
		wf: Wf,
		description: string,
		metadata: Prisma.InputJsonValue,
	) =>
		tx.auditLog.create({
			data: {
				tenantId: event.tenantId,
				userId: actorId,
				action: AuditAction.UPDATE,
				entityType: AuditEntityType.WORKFLOW,
				entityId: wf.id,
				description,
				metadata,
				ipAddress,
				userAgent,
			},
		})

	if (plan.kind === 'add') {
		let moved = 0
		let granted = 0
		// Grants and move-back, for a step just added or restored.
		const staffAndMoveBack = async (step: {
			id: string
			name: string
			nextStepId: string | null
		}) => {
			const access = await tx.userEventAccess.createMany({
				data: plan.grants.map(g => ({
					userId: g.id,
					eventId: event.id,
					roleId: plan.step.roleId,
					stepId: step.id,
				})),
				skipDuplicates: true,
			})
			granted += access.count
			if (!plan.moveBack.length || !step.nextStepId) return []
			const [from, to] = await Promise.all(
				[step.nextStepId, step.id].map(id =>
					tx.step.findUniqueOrThrow({
						where: { id },
						select: LIFECYCLE_STEP_SELECT,
					}),
				),
			)
			const ids = await moveParticipantsTx(tx, {
				from: from!,
				to: to!,
				participantIds: 'all',
				statuses: plan.moveBack,
				userId: actorId,
				remarks: moveRemarks(from!.name, to!.name, `step "${to!.name}" added`),
			})
			moved += ids.length
			return ids
		}
		for (const r of plan.restores) {
			const step = await tx.step.findUniqueOrThrow({
				where: { id: r.step.id },
				select: LIFECYCLE_STEP_SELECT,
			})
			const result = await restoreStepTx(tx, step)
			const restored = await tx.step.findUniqueOrThrow({
				where: { id: step.id },
				select: { id: true, name: true, nextStepId: true },
			})
			const ids = await staffAndMoveBack(restored)
			await audit(
				r.wf,
				`Restored step "${step.name}" in event "${event.name}" (added from the setup wizard)` +
					(ids.length
						? ` and moved ${plural(ids.length, 'participant')} back to it`
						: ''),
				{
					eventId: event.id,
					step: { id: step.id, name: step.name },
					relinked: result.relinked,
					notRelinked: result.notRelinked,
					accessRestored: result.accessRestored,
					accessGranted: plan.grants.map(g => g.id),
					movedBack: ids,
				},
			)
		}
		for (const i of plan.items) {
			const { created } = await insertStepAfterTx(tx, {
				afterStepId: i.after.id,
				step: {
					name: plan.step.name,
					action: plan.step.action,
					roleId: plan.step.roleId,
					requiresAssignment: plan.step.requiresAssignment,
					slaDurationMinutes: plan.step.slaDurationMinutes,
				},
			})
			const ids = await staffAndMoveBack(created)
			await audit(
				i.wf,
				`Added step "${created.name}" after "${i.after.name}" in event "${event.name}"` +
					(ids.length
						? ` and moved ${plural(ids.length, 'participant')} back to it`
						: ''),
				{
					eventId: event.id,
					step: { id: created.id, name: created.name },
					after: { id: i.after.id, name: i.after.name },
					accessGranted: plan.grants.map(g => g.id),
					movedBack: ids,
				},
			)
		}
		return {
			summary:
				`"${plan.step.name}": ` +
				[
					plan.items.length &&
						`added to ${plural(plan.items.length, 'workflow')}`,
					plan.restores.length &&
						`restored in ${plural(plan.restores.length, 'workflow')}`,
				]
					.filter(Boolean)
					.join(', ') +
				`; ${plural(granted, 'access grant')}; ${plural(moved, 'participant')} moved back.`,
			counts: {
				workflows: planSize(plan),
				granted,
				moved,
			},
		}
	}

	if (plan.kind === 'remove') {
		let retired = 0
		let moved = 0
		for (const i of plan.items) {
			// Re-read inside the transaction: the plan may be minutes old.
			const step = await tx.step.findUniqueOrThrow({
				where: { id: i.step.id },
				select: LIFECYCLE_STEP_SELECT,
			})
			let ids: string[] = []
			if (i.moveTo) {
				const to = await tx.step.findUniqueOrThrow({
					where: { id: i.moveTo.id },
					select: LIFECYCLE_STEP_SELECT,
				})
				ids = await moveParticipantsTx(tx, {
					from: step,
					to,
					participantIds: 'all',
					userId: actorId,
					remarks: moveRemarks(
						step.name,
						to.name,
						`step "${step.name}" removed`,
					),
				})
				moved += ids.length
			}
			// Always retire: a removal made here can be undone with Restore.
			const result = await removeStepTx(tx, step, { retire: true })
			retired++
			await audit(
				i.wf,
				`Retired step "${step.name}" in event "${event.name}"` +
					(ids.length
						? ` after moving ${plural(ids.length, 'participant')} to "${i.moveTo!.name}"`
						: ''),
				{
					eventId: event.id,
					step: { id: step.id, name: step.name },
					outcome: result.outcome,
					moved: ids,
				},
			)
		}
		return {
			summary: `Retired "${plan.stepName}" in ${plural(retired, 'workflow')}; ${plural(moved, 'participant')} moved. Restore puts it back.`,
			counts: { workflows: plan.items.length, retired, moved },
		}
	}

	for (const i of plan.items) {
		const step = await tx.step.findUniqueOrThrow({
			where: { id: i.step.id },
			select: LIFECYCLE_STEP_SELECT,
		})
		const result = await restoreStepTx(tx, step)
		await audit(i.wf, `Restored step "${step.name}" in event "${event.name}"`, {
			eventId: event.id,
			step: { id: step.id, name: step.name },
			relinked: result.relinked,
			notRelinked: result.notRelinked,
			accessRestored: result.accessRestored,
		})
	}
	return {
		summary: `Restored "${plan.stepName}" in ${plural(plan.items.length, 'workflow')}.`,
		counts: { workflows: plan.items.length },
	}
}
