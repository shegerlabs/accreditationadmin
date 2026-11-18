// lib/workflow-changes.ts
// Change the workflows of an event that is already running, without purging
// anything: add a step, remove one, or restore a retired one, across every
// workflow of the event (or the ones chosen) at once.
//
// This file only asks the questions. Planning and writing live in
// app/utils/workflow-changes-core.server.ts, shared with the setup wizard's
// "Change live workflows" page, so both follow the same rules: removing a step
// always retires it (restorable) rather than deleting it, entry and rejection/bypass
// target steps can't be removed, and every participant moved gets a MOVE
// approval naming the admin. Each change is printed first and written only
// with --confirm, in one transaction across all the workflows it touches.
//
// Decision record: docs/decisions/2026-11-16-changing-workflows-mid-event.md

import { type PrismaClient, type RequestStatus } from '@prisma/client'
import prompts from 'prompts'
import { plural } from '../../app/utils/step-lifecycle-core.server.js'
import {
	INSERTABLE_ACTIONS,
	WORKFLOW_CHANGE_TRANSACTION,
	addItems,
	afterStepOptions,
	applyWorkflowChange,
	buildRemovePlan,
	buildRestorePlan,
	describePlan,
	loadEventWorkflows,
	moveBackOptions,
	planAddRestores,
	planSize,
	removableStepOptions,
	removeCandidates,
	retiredStepCounts,
	staffForStep,
	templateStepOptions,
	workflowShapes,
	type AddPlan,
	type ChangeEvent,
	type RemoveTarget,
	type StepSpec,
	type Wf,
	type WorkflowChangePlan,
} from '../../app/utils/workflow-changes-core.server.js'
import { runBackupGate } from './backup.js'
import { confirmDatabaseName } from './confirm.js'

interface Context {
	prisma: PrismaClient
	event: ChangeEvent
}

function cancelled(): never {
	console.log('\nCancelled. Nothing was changed.\n')
	process.exit(1)
}

function printWorkflows(workflows: Wf[]) {
	console.log(`\nCURRENT WORKFLOWS (${workflows.length}):`)
	for (const shape of workflowShapes(workflows)) {
		console.log(
			`\n  ${shape.steps.join(' → ')}` +
				(shape.offChain.length
					? `   [also: ${shape.offChain.join(', ')}]`
					: ''),
		)
		console.log(
			`    ${shape.every ? 'every workflow' : shape.typeNames.join(', ')}`,
		)
	}
	const retired = retiredStepCounts(workflows)
	if (retired.size)
		console.log(
			`\n  Retired: ${[...retired].map(([n, c]) => `${n} (${c})`).join(', ')}`,
		)
}

// --- Choosing --------------------------------------------------------------

async function pickEvent(prisma: PrismaClient) {
	const events = await prisma.event.findMany({
		where: { deletedAt: null },
		select: {
			id: true,
			name: true,
			status: true,
			tenantId: true,
			_count: { select: { participants: true, workflows: true } },
		},
		orderBy: { startDate: 'desc' },
	})
	if (events.length === 0) throw new Error('There are no events.')
	if (events.length === 1) {
		const e = events[0]!
		console.log(`\nEvent: ${e.name} (${e.status})`)
		return e
	}
	const { id } = await prompts({
		type: 'select',
		name: 'id',
		message: 'Which event?',
		choices: events.map(e => ({
			title: `${e.name} (${e.status}, ${e._count.workflows} workflows, ${e._count.participants} participants)`,
			value: e.id,
		})),
	})
	if (!id) cancelled()
	return events.find(e => e.id === id)!
}

async function pickWorkflows(workflows: Wf[]): Promise<Wf[]> {
	const { scope } = await prompts({
		type: 'select',
		name: 'scope',
		message: 'Which workflows?',
		choices: [
			{ title: `All ${workflows.length}`, value: 'all' },
			{ title: 'Let me choose', value: 'some' },
		],
	})
	if (!scope) cancelled()
	if (scope === 'all') return workflows
	const { ids } = await prompts({
		type: 'multiselect',
		name: 'ids',
		message: 'Workflows (space to toggle, enter to accept)',
		choices: workflows.map(w => ({ title: w.typeName, value: w.id })),
		min: 1,
	})
	if (!ids) cancelled()
	return workflows.filter(w => ids.includes(w.id))
}

/** The account the change is recorded under, in MOVE approvals and the audit log. */
async function pickActor(ctx: Context) {
	const admins = await ctx.prisma.user.findMany({
		where: {
			status: 'ACTIVE',
			roles: { some: { name: 'admin' } },
			OR: [{ tenantId: ctx.event.tenantId }, { tenantId: null }],
		},
		select: { id: true, username: true, name: true },
		orderBy: { username: 'asc' },
	})
	if (admins.length === 0)
		throw new Error(
			'No active admin account found to record the changes under. Create one first.',
		)
	const { id } = await prompts({
		type: 'select',
		name: 'id',
		message: 'Record these changes under which admin account?',
		choices: admins.map(a => ({
			title: `${a.username}${a.name ? ` (${a.name})` : ''}`,
			value: a.id,
		})),
	})
	if (!id) cancelled()
	return admins.find(a => a.id === id)!
}

// --- Asking: add -----------------------------------------------------------

async function askAdd(ctx: Context, chosen: Wf[]): Promise<AddPlan> {
	const templateSteps = await templateStepOptions(
		ctx.prisma,
		ctx.event.tenantId,
		chosen,
	)
	const { source } = await prompts({
		type: 'select',
		name: 'source',
		message: 'What step do you want to add?',
		choices: [
			...templateSteps.map(t => ({
				title:
					`${t.step.name}  (${t.step.action}, ${t.step.roleName}) — from "${t.templateName}"` +
					(t.inEveryChosen ? '  [every chosen workflow has it]' : ''),
				value: t.id,
			})),
			{ title: 'A new step I describe', value: 'custom' },
		],
		initial: Math.max(
			0,
			templateSteps.findIndex(t => !t.inEveryChosen),
		),
	})
	if (!source) cancelled()

	let step: StepSpec
	let suggestedAfter: string | null = null
	if (source === 'custom') {
		const roles = await ctx.prisma.role.findMany({
			select: { id: true, name: true },
			orderBy: { name: 'asc' },
		})
		const answers = await prompts([
			{
				type: 'text',
				name: 'name',
				message: 'Step name',
				validate: (v: string) => (v.trim() ? true : 'Required'),
			},
			{
				type: 'select',
				name: 'action',
				message: 'What happens at this step?',
				choices: INSERTABLE_ACTIONS.map(a => ({ title: a, value: a })),
			},
			{
				type: 'select',
				name: 'roleId',
				message: 'Which role works on it?',
				choices: roles.map(r => ({ title: r.name, value: r.id })),
				initial: Math.max(
					0,
					roles.findIndex(r => r.name === 'validator'),
				),
			},
			{
				type: 'confirm',
				name: 'requiresAssignment',
				message: 'Only users given access to this step can act on it?',
				initial: true,
			},
		])
		if (!answers.name || !answers.action || !answers.roleId) cancelled()
		step = {
			name: answers.name.trim(),
			action: answers.action,
			roleId: answers.roleId,
			roleName: roles.find(r => r.id === answers.roleId)!.name,
			requiresAssignment: answers.requiresAssignment !== false,
			slaDurationMinutes: null,
		}
	} else {
		const t = templateSteps.find(t => t.id === source)!
		step = t.step
		suggestedAfter = t.suggestedAfter
	}

	// Where it goes: after a step the participants walk through.
	const afterChoices = afterStepOptions(chosen).map(o => ({
		title: `${o.name}${o.count === chosen.length ? '' : `  (only in ${o.count} of ${chosen.length})`}`,
		value: o.name,
	}))
	const { afterName } = await prompts({
		type: 'select',
		name: 'afterName',
		message: `Put "${step.name}" right after which step?`,
		choices: afterChoices,
		initial: Math.max(
			0,
			afterChoices.findIndex(c => c.value === suggestedAfter),
		),
	})
	if (!afterName) cancelled()

	const found = addItems(chosen, step, afterName)
	const { items } = found
	const { restores, skipped: notRestored } = await planAddRestores(
		ctx.prisma,
		found.retired,
	)
	const skipped = [...found.skipped, ...notRestored]

	// Who works on it. Without access nobody sees the participants waiting there.
	let grants: AddPlan['grants'] = []
	if ((items.length || restores.length) && step.requiresAssignment) {
		const staff = await staffForStep(
			ctx.prisma,
			ctx.event,
			step.roleId,
			afterName,
		)
		if (staff.length === 0) {
			console.log(
				`\n⚠  No active user has the "${step.roleName}" role, so nobody can be given access yet.`,
			)
		} else {
			const { ids } = await prompts({
				type: 'multiselect',
				name: 'ids',
				message: `Give access to "${step.name}" in these workflows to (space to toggle)`,
				hint: `users marked * work on "${afterName}" now`,
				choices: staff.map(u => ({
					title: `${u.username}${u.name ? ` (${u.name})` : ''}${u.worksOnAfter ? ' *' : ''}`,
					value: u.id,
				})),
			})
			if (!ids) cancelled()
			grants = staff
				.filter(u => ids.includes(u.id))
				.map(u => ({ id: u.id, label: u.username }))
		}
	}

	// Participants who already went past the insertion point.
	let moveBack: RequestStatus[] = []
	let moveBackCount = 0
	const byStatus = await moveBackOptions(ctx.prisma, items, restores)
	if (byStatus.length) {
		const nextNames = [
			...new Set([
				...items.flatMap(i => (i.oldNext ? [i.oldNext.name] : [])),
				...restores.flatMap(r => (r.preview.next ? [r.preview.next.name] : [])),
			]),
		].join(' / ')
		const total = byStatus.reduce((n, s) => n + s.count, 0)
		console.log(
			`\n${plural(total, 'participant')} already passed "${afterName}" and ${total === 1 ? 'is' : 'are'} at "${nextNames}".`,
		)
		console.log(
			'They will NOT go through the new step unless you move them back to it.',
		)
		const { statuses } = await prompts({
			type: 'multiselect',
			name: 'statuses',
			message:
				'Move back the ones with status (space to toggle; none = leave them)',
			choices: byStatus.map(s => ({
				title: `${s.status} (${s.count})${s.status === 'BYPASSED' ? ' — bypassed, usually leave out' : ''}`,
				value: s.status,
			})),
		})
		if (!statuses) cancelled()
		moveBack = statuses
		moveBackCount = byStatus
			.filter(s => moveBack.includes(s.status))
			.reduce((n, s) => n + s.count, 0)
	}

	return {
		kind: 'add',
		step,
		afterName,
		items,
		restores,
		skipped,
		grants,
		moveBack,
		moveBackCount,
	}
}

// --- Asking: remove and restore --------------------------------------------

async function askRemove(chosen: Wf[]) {
	const { stepName } = await prompts({
		type: 'select',
		name: 'stepName',
		message: 'Which step do you want to remove?',
		choices: removableStepOptions(chosen).map(o => ({
			title: `${o.name}${o.count === chosen.length ? '' : `  (in ${o.count} of ${chosen.length})`}`,
			value: o.name,
		})),
	})
	if (!stepName) cancelled()

	const { removable, waiting, otherSteps } = removeCandidates(chosen, stepName)
	let target: RemoveTarget = { kind: 'next' }
	if (waiting > 0) {
		console.log(
			`\n${plural(waiting, 'participant')} ${waiting === 1 ? 'is' : 'are'} waiting at "${stepName}" and must be moved first.`,
		)
		const { choice } = await prompts({
			type: 'select',
			name: 'choice',
			message: 'Move them to',
			choices: [
				{
					title: `The step after "${stepName}" (in each workflow)`,
					value: { kind: 'next' },
				},
				...otherSteps.map(o => ({
					title: `"${o.name}"${o.count === removable.length ? '' : `  (only in ${o.count} of ${removable.length})`}`,
					value: { kind: 'step', name: o.name },
				})),
				{
					title:
						'Leave them; skip workflows that still have participants there',
					value: { kind: 'skip' },
				},
			],
		})
		if (!choice) cancelled()
		target = choice
	}
	return buildRemovePlan(chosen, stepName, target)
}

async function askRestore(ctx: Context, chosen: Wf[]) {
	const names = retiredStepCounts(chosen)
	if (names.size === 0) {
		console.log('\nNone of these workflows has a retired step.')
		return null
	}
	const { stepName } = await prompts({
		type: 'select',
		name: 'stepName',
		message: 'Which retired step do you want to bring back?',
		choices: [...names].map(([name, n]) => ({
			title: `${name}  (retired in ${n} of ${chosen.length})`,
			value: name,
		})),
	})
	if (!stepName) cancelled()
	return buildRestorePlan(ctx.prisma, chosen, stepName)
}

function printPlan(plan: WorkflowChangePlan) {
	const d = describePlan(plan)
	console.log(`\nPLAN:\n  ${d.title}:`)
	for (const r of d.rows) console.log(`    ${r.typeName.padEnd(26)} ${r.text}`)
	for (const n of d.notes) console.log(`  ${n}`)
	if (d.skipped.length) {
		console.log('  Skipped:')
		for (const s of d.skipped)
			console.log(`    ${s.typeName.padEnd(26)} ${s.reason}`)
	}
}

// --- The loop --------------------------------------------------------------

export async function runWorkflowChanges(
	prisma: PrismaClient,
	{ confirm, databaseName }: { confirm: boolean; databaseName: string },
) {
	const event = await pickEvent(prisma)
	const ctx: Context = { prisma, event }
	let actor: { id: string } | undefined
	let cleared = false

	for (;;) {
		const workflows = await loadEventWorkflows(prisma, event.id)
		if (workflows.length === 0) {
			console.log('\nThis event has no workflows. Nothing to change.')
			return
		}
		printWorkflows(workflows)

		const { op } = await prompts({
			type: 'select',
			name: 'op',
			message: 'What do you want to change?',
			choices: [
				{ title: 'Add a step (e.g. a second validation level)', value: 'add' },
				{ title: 'Remove a step (retired if it has history)', value: 'remove' },
				{ title: 'Restore a retired step', value: 'restore' },
				{ title: 'Done', value: 'done' },
			],
		})
		if (!op || op === 'done') return

		const chosen = await pickWorkflows(workflows)
		const plan =
			op === 'add'
				? await askAdd(ctx, chosen)
				: op === 'remove'
					? await askRemove(chosen)
					: await askRestore(ctx, chosen)
		if (!plan) continue

		printPlan(plan)
		if (planSize(plan) === 0) {
			console.log('\nNothing to change.')
			continue
		}
		if (!confirm) {
			console.log(
				'\nDry run — nothing was written. Re-run with --confirm to apply.',
			)
			continue
		}

		const { apply } = await prompts({
			type: 'confirm',
			name: 'apply',
			message: 'Apply this change?',
			initial: false,
		})
		if (!apply) continue

		// Once per session, before the first write.
		if (!cleared) {
			actor = await pickActor(ctx)
			const ok = await confirmDatabaseName(
				databaseName,
				'Type the database name to confirm changing live workflows',
			)
			if (!ok) return
			runBackupGate()
			cleared = true
		}

		const { summary } = await prisma.$transaction(
			tx =>
				applyWorkflowChange(tx, {
					event,
					plan,
					actorId: actor!.id,
					userAgent: 'scripts/setup-event (workflow changes)',
				}),
			WORKFLOW_CHANGE_TRANSACTION,
		)
		console.log(`\n✓ ${summary}`)
	}
}
