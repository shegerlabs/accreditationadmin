// The setup wizard's "Change live workflows" page: turn the page's choices
// (URL search params while previewing, the same fields when applying) into a
// plan, with the options each choice offers. The loader and the action both
// call resolveWorkflowChange, so what is applied is rebuilt from the database,
// never trusted from the browser; planFingerprint catches a plan that changed
// between preview and apply.
// Decision record: docs/decisions/2026-11-16-changing-workflows-mid-event.md

import { RequestStatus, type Action } from '@prisma/client'
import { prisma } from '~/utils/db.server'
import {
	INSERTABLE_ACTIONS,
	addItems,
	afterStepOptions,
	buildRemovePlan,
	buildRestorePlan,
	describePlan,
	loadEventWorkflows,
	moveBackOptions,
	planAddRestores,
	planFingerprint,
	planSize,
	removableStepOptions,
	removeCandidates,
	retiredStepCounts,
	staffForStep,
	templateStepOptions,
	workflowShapes,
	type ChangeEvent,
	type RemoveTarget,
	type StepSpec,
	type WorkflowChangePlan,
} from '~/utils/workflow-changes-core.server'

export const CHANGE_OPS = ['add', 'remove', 'restore'] as const
export type ChangeOp = (typeof CHANGE_OPS)[number]

const STATUSES = new Set<string>(Object.values(RequestStatus))

function parseTarget(value: string | null): RemoveTarget {
	if (value === 'skip') return { kind: 'skip' }
	if (value?.startsWith('step:')) return { kind: 'step', name: value.slice(5) }
	return { kind: 'next' }
}

export async function resolveWorkflowChange(
	event: ChangeEvent,
	params: URLSearchParams,
) {
	const workflows = await loadEventWorkflows(prisma, event.id)
	const overview = {
		shapes: workflowShapes(workflows),
		retired: [...retiredStepCounts(workflows)].map(([name, count]) => ({
			name,
			count,
		})),
		workflows: workflows.map(w => ({ id: w.id, typeName: w.typeName })),
	}

	const op = CHANGE_OPS.find(o => o === params.get('op')) ?? null
	// 'all' unless the admin asked to choose; choosing with none ticked chooses nothing.
	const scope = params.get('scope') === 'some' ? 'some' : 'all'
	const picked = new Set(params.getAll('wf'))
	const chosen =
		scope === 'all' ? workflows : workflows.filter(w => picked.has(w.id))

	let plan: WorkflowChangePlan | null = null
	let add = null
	let remove = null
	let restore = null

	if (op === 'add' && chosen.length > 0) {
		const [templateSteps, roles] = await Promise.all([
			templateStepOptions(prisma, event.tenantId, chosen),
			prisma.role.findMany({
				select: { id: true, name: true },
				orderBy: { name: 'asc' },
			}),
		])
		const source = params.get('source') ?? ''
		const custom = {
			name: (params.get('name') ?? '').trim(),
			action: (INSERTABLE_ACTIONS.find(a => a === params.get('action')) ??
				'APPROVE') as Action,
			roleId: params.get('roleId') ?? '',
			requiresAssignment: params.get('assign') !== 'no',
		}
		let step: StepSpec | null = null
		let suggestedAfter: string | null = null
		if (source === 'custom') {
			const role = roles.find(r => r.id === custom.roleId)
			if (custom.name && role)
				step = { ...custom, roleName: role.name, slaDurationMinutes: null }
		} else {
			const t = templateSteps.find(t => t.id === source)
			if (t) {
				step = t.step
				suggestedAfter = t.suggestedAfter
			}
		}

		const afterOptions = afterStepOptions(chosen)
		const afterName =
			afterOptions.find(o => o.name === params.get('after'))?.name ??
			afterOptions.find(o => o.name === suggestedAfter)?.name ??
			null

		let staff: Awaited<ReturnType<typeof staffForStep>> = []
		let back: Awaited<ReturnType<typeof moveBackOptions>> = []
		if (step && afterName) {
			const found = addItems(chosen, step, afterName)
			const { items } = found
			const { restores, skipped: notRestored } = await planAddRestores(
				prisma,
				found.retired,
			)
			const skipped = [...found.skipped, ...notRestored]
			;[staff, back] = await Promise.all([
				(items.length || restores.length) && step.requiresAssignment
					? staffForStep(prisma, event, step.roleId, afterName)
					: [],
				moveBackOptions(prisma, items, restores),
			])
			const grantIds = new Set(params.getAll('grant'))
			const moveBack = params
				.getAll('back')
				.filter(s => STATUSES.has(s))
				.filter(s => back.some(b => b.status === s)) as RequestStatus[]
			plan = {
				kind: 'add',
				step,
				afterName,
				items,
				restores,
				skipped,
				grants: staff
					.filter(u => grantIds.has(u.id))
					.map(u => ({ id: u.id, label: u.name || u.username })),
				moveBack,
				moveBackCount: back
					.filter(b => moveBack.includes(b.status))
					.reduce((n, b) => n + b.count, 0),
			}
		}
		add = {
			templateSteps: templateSteps.map(t => ({
				id: t.id,
				name: t.step.name,
				detail: `${t.step.action.toLowerCase()} · ${t.step.roleName}`,
				templateName: t.templateName,
				inEveryChosen: t.inEveryChosen,
			})),
			roles,
			actions: INSERTABLE_ACTIONS,
			source,
			custom,
			step: step && { name: step.name, roleName: step.roleName },
			afterOptions,
			afterName,
			staff,
			back,
			nextNames:
				plan?.kind === 'add'
					? [
							...new Set([
								...plan.items.flatMap(i => (i.oldNext ? [i.oldNext.name] : [])),
								...plan.restores.flatMap(r =>
									r.preview.next ? [r.preview.next.name] : [],
								),
							]),
						]
					: [],
		}
	}

	if (op === 'remove' && chosen.length > 0) {
		const options = removableStepOptions(chosen)
		const stepName = options.find(o => o.name === params.get('step'))?.name
		let candidates = null
		if (stepName) {
			const c = removeCandidates(chosen, stepName)
			candidates = {
				waiting: c.waiting,
				removable: c.removable.length,
				otherSteps: c.otherSteps,
			}
			plan = buildRemovePlan(
				chosen,
				stepName,
				parseTarget(params.get('target')),
			)
		}
		remove = {
			options,
			stepName: stepName ?? null,
			target: params.get('target') ?? 'next',
			candidates,
		}
	}

	if (op === 'restore' && chosen.length > 0) {
		const options = [...retiredStepCounts(chosen)].map(([name, count]) => ({
			name,
			count,
		}))
		const stepName = options.find(o => o.name === params.get('step'))?.name
		if (stepName) plan = await buildRestorePlan(prisma, chosen, stepName)
		restore = { options, stepName: stepName ?? null }
	}

	return {
		overview,
		op,
		scope,
		picked: [...picked].filter(id => workflows.some(w => w.id === id)),
		chosenCount: chosen.length,
		add,
		remove,
		restore,
		plan,
		preview: plan && {
			...describePlan(plan),
			fingerprint: planFingerprint(plan),
			canApply: planSize(plan) > 0,
		},
	}
}
