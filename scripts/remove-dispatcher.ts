// remove-dispatcher.ts
// One-off: take the dispatcher role out of the database
// (docs/decisions/2026-11-16-remove-dispatcher.md).
//
// USAGE:
//   npx tsx scripts/remove-dispatcher.ts             # DRY RUN (default)
//   npx tsx scripts/remove-dispatcher.ts --confirm   # Back up, then apply
//
// WHAT IT DOES, in one transaction:
//   1. Moves anyone waiting at a Badge Collection step to the step after it
//      (their status is left alone, normally Printed), along with the
//      approvals recorded there. Those are mostly printers' own reprints,
//      which are recorded at the step the person is on; future ones land on
//      the step after too.
//   2. Relinks steps and step templates that led to a collection step to the
//      step after it, and closes the gap in step order.
//   3. Deletes the collection steps and step templates, event access for the
//      role, the dispatcher menu items and the reprint queue menu item, and any
//      "badge collected" email templates.
//   4. Deletes accounts whose only roles are dispatcher (and user); others just
//      lose the role. Then deletes the role.
//
// SAFETY:
//   Steps, roles and users cascade-delete participants, approvals and more, so
//   it refuses to run if anything recorded would be lost: a collection step
//   with participants or approvals but no step after it, or approvals,
//   participants, reports or backups belonging to an account it would delete. Dry run is the default; --confirm asks for
//   the database name and runs scripts/accreditation.sh before any write.

import { type Prisma, PrismaClient } from '@prisma/client'
import { runBackupGate } from './lib/backup.js'
import { confirmDatabaseName } from './lib/confirm.js'
import { describeTarget, printBanner } from './lib/target.js'

const prisma = new PrismaClient()

const ROLE = 'dispatcher'
const OBSOLETE_LINK: Prisma.MenuItemWhereInput = {
	OR: [
		{ link: { startsWith: '/dispatcher' } },
		{ link: { startsWith: '/printer/reprints' } },
	],
}

/** Follows nextStepId past steps being removed. */
function successor<T extends { id: string; nextStepId: string | null }>(
	id: string | null,
	all: Map<string, T>,
	removed: Set<string>,
) {
	const seen = new Set<string>()
	while (id && removed.has(id)) {
		if (seen.has(id)) return null
		seen.add(id)
		id = all.get(id)?.nextStepId ?? null
	}
	return id
}

async function plan() {
	const role = await prisma.role.findUnique({
		where: { name: ROLE },
		select: { id: true },
	})
	const removedStepWhere: Prisma.StepWhereInput = {
		OR: [{ action: 'COLLECT' }, ...(role ? [{ roleId: role.id }] : [])],
	}
	const removedTemplateWhere: Prisma.StepTemplateWhereInput = {
		OR: [{ action: 'COLLECT' }, ...(role ? [{ roleId: role.id }] : [])],
	}
	const steps = await prisma.step.findMany({
		where: removedStepWhere,
		select: {
			id: true,
			name: true,
			order: true,
			workflowId: true,
			nextStepId: true,
			isBypassTarget: true,
			isRejectionTarget: true,
			workflow: { select: { name: true } },
			_count: { select: { participants: true, approvals: true } },
		},
	})
	const templates = await prisma.stepTemplate.findMany({
		where: removedTemplateWhere,
		select: {
			id: true,
			name: true,
			order: true,
			workflowTemplateId: true,
			nextStepId: true,
			workflowTemplate: { select: { name: true } },
		},
	})
	const holders = role
		? await prisma.user.findMany({
				where: { roles: { some: { id: role.id } } },
				select: {
					id: true,
					username: true,
					roles: { select: { name: true } },
					_count: {
						select: {
							approvals: true,
							participants: true,
							customReports: true,
							backups: true,
						},
					},
				},
			})
		: []
	const doomed = holders.filter(u =>
		u.roles.every(r => r.name === ROLE || r.name === 'user'),
	)
	const counts = {
		eventAccess: role
			? await prisma.userEventAccess.count({
					where: {
						OR: [{ roleId: role.id }, { stepId: { in: steps.map(s => s.id) } }],
					},
				})
			: 0,
		menuItems: await prisma.menuItem.findMany({
			where: OBSOLETE_LINK,
			select: { title: true, link: true },
		}),
		emailTemplates: await prisma.emailTemplate.count({
			where: { trigger: 'BADGE_COLLECTED' },
		}),
	}
	return { role, steps, templates, holders, doomed, counts }
}

type Plan = Awaited<ReturnType<typeof plan>>

function problems(p: Plan) {
	const out: string[] = []
	for (const s of p.steps) {
		const where = `"${s.name}" in ${s.workflow.name}`
		if (s._count.participants + s._count.approvals > 0 && !s.nextStepId)
			out.push(
				`${where} has ${s._count.participants} participant(s) and ${s._count.approvals} approval(s), and no step after it to move them to.`,
			)
		if (s.isBypassTarget || s.isRejectionTarget)
			out.push(`${where} is a bypass or rejection target.`)
	}
	for (const u of p.doomed) {
		const c = u._count
		const owned = [
			c.approvals && `${c.approvals} approval(s)`,
			c.participants && `${c.participants} participant(s)`,
			c.customReports && `${c.customReports} custom report(s)`,
			c.backups && `${c.backups} backup record(s)`,
		].filter(Boolean)
		if (owned.length)
			out.push(`Account "${u.username}" owns ${owned.join(', ')}.`)
	}
	return out
}

function report(p: Plan) {
	console.log(`\nRole "${ROLE}": ${p.role ? 'present' : 'not found'}`)
	console.log(`\nCollection steps to remove: ${p.steps.length}`)
	for (const s of p.steps)
		console.log(
			`  - ${s.workflow.name} › ${s.name}: move ${s._count.participants} participant(s) and ${s._count.approvals} approval(s) on`,
		)
	console.log(`Collection step templates to remove: ${p.templates.length}`)
	for (const t of p.templates)
		console.log(`  - ${t.workflowTemplate.name} › ${t.name}`)
	console.log(`Event access rows to remove: ${p.counts.eventAccess}`)
	console.log(`Menu items to remove: ${p.counts.menuItems.length}`)
	for (const m of p.counts.menuItems) console.log(`  - ${m.title} (${m.link})`)
	console.log(
		`"Badge collected" email templates to remove: ${p.counts.emailTemplates}`,
	)
	const kept = p.holders.filter(u => !p.doomed.includes(u))
	console.log(
		`Accounts to delete: ${p.doomed.map(u => u.username).join(', ') || 'none'}`,
	)
	if (kept.length)
		console.log(
			`Accounts losing the role only: ${kept.map(u => u.username).join(', ')}`,
		)
}

async function apply(p: Plan) {
	await prisma.$transaction(
		async tx => {
			const removed = new Set(p.steps.map(s => s.id))
			const workflowIds = [...new Set(p.steps.map(s => s.workflowId))]
			const allSteps = new Map(
				(
					await tx.step.findMany({
						where: { workflowId: { in: workflowIds } },
						select: { id: true, nextStepId: true },
					})
				).map(s => [s.id, s]),
			)
			for (const s of p.steps) {
				const next = successor(s.id, allSteps, removed)
				if (s._count.participants > 0)
					await tx.participant.updateMany({
						where: { stepId: s.id },
						data: { stepId: next! },
					})
				if (s._count.approvals > 0)
					await tx.approval.updateMany({
						where: { stepId: s.id },
						data: { stepId: next! },
					})
				await tx.step.updateMany({
					where: { nextStepId: s.id, id: { notIn: [...removed] } },
					data: { nextStepId: next },
				})
			}
			// Close the gap in each workflow's order, highest removed step first.
			for (const s of [...p.steps].sort((a, b) => b.order - a.order))
				await tx.step.updateMany({
					where: { workflowId: s.workflowId, order: { gt: s.order } },
					data: { order: { decrement: 1 } },
				})

			const removedT = new Set(p.templates.map(t => t.id))
			const allTemplates = new Map(
				(
					await tx.stepTemplate.findMany({
						where: {
							workflowTemplateId: {
								in: [...new Set(p.templates.map(t => t.workflowTemplateId))],
							},
						},
						select: { id: true, nextStepId: true },
					})
				).map(t => [t.id, t]),
			)
			for (const t of p.templates)
				await tx.stepTemplate.updateMany({
					where: { nextStepId: t.id, id: { notIn: [...removedT] } },
					data: { nextStepId: successor(t.id, allTemplates, removedT) },
				})
			for (const t of [...p.templates].sort((a, b) => b.order - a.order))
				await tx.stepTemplate.updateMany({
					where: {
						workflowTemplateId: t.workflowTemplateId,
						order: { gt: t.order },
					},
					data: { order: { decrement: 1 } },
				})

			if (p.role)
				await tx.userEventAccess.deleteMany({
					where: {
						OR: [{ roleId: p.role.id }, { stepId: { in: [...removed] } }],
					},
				})
			// Participants and approvals were moved off, so nothing cascades.
			await tx.step.deleteMany({ where: { id: { in: [...removed] } } })
			await tx.stepTemplate.deleteMany({ where: { id: { in: [...removedT] } } })
			await tx.menuItem.deleteMany({ where: OBSOLETE_LINK })
			await tx.emailTemplate.deleteMany({
				where: { trigger: 'BADGE_COLLECTED' },
			})
			await tx.user.deleteMany({
				where: { id: { in: p.doomed.map(u => u.id) } },
			})
			if (p.role) await tx.role.delete({ where: { id: p.role.id } })
		},
		{ maxWait: 30_000, timeout: 120_000 },
	)
}

async function main() {
	const confirm = process.argv.includes('--confirm')
	const target = describeTarget()
	printBanner(
		confirm ? 'REMOVE DISPATCHER — LIVE RUN' : 'REMOVE DISPATCHER — DRY RUN',
		target,
	)

	const p = await plan()
	report(p)

	const blocking = problems(p)
	if (blocking.length) {
		console.log('\nRefusing to run: this would delete recorded history.')
		for (const b of blocking) console.log(`  ✗ ${b}`)
		process.exitCode = 1
		return
	}
	if (
		!p.role &&
		p.steps.length + p.templates.length + p.counts.menuItems.length === 0
	) {
		console.log('\nNothing to do.')
		return
	}
	if (!confirm) {
		console.log('\nDry run — nothing was changed.')
		console.log('Re-run with --confirm to take a backup and apply.\n')
		return
	}

	const confirmed = await confirmDatabaseName(
		target.name,
		'Type the database name to remove the dispatcher role',
	)
	if (!confirmed) {
		process.exitCode = 1
		return
	}
	runBackupGate()
	await apply(p)

	const after = await plan()
	const left =
		(after.role ? 1 : 0) +
		after.steps.length +
		after.templates.length +
		after.counts.menuItems.length
	if (left > 0) {
		console.log('\n✗ Something is left over:')
		report(after)
		process.exitCode = 1
		return
	}
	console.log('\nDispatcher role removed and verified.\n')
}

main()
	.catch(e => {
		console.error(`\n${e instanceof Error ? e.message : String(e)}`)
		process.exitCode = 1
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
