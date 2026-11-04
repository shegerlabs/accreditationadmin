#!/usr/bin/env node

import { PrismaClient } from '@prisma/client'
import chalk from 'chalk'
import prompts from 'prompts'

const prisma = new PrismaClient()
const BATCH_SIZE = 100

interface MismatchRecord {
	id: string
	registrationCode: string
	firstName: string
	familyName: string
	eventId: string
	tenantId: string
	participantTypeId: string
	participantTypeName: string
	stepName: string
	workflowParticipantTypeName: string
}

async function main() {
	console.log(chalk.bold('\nParticipant Step Mismatch Fixer'))
	console.log(chalk.gray('Finds participants whose stepId points to a workflow for a different participant type.\n'))

	// Use raw query to efficiently find mismatches via join
	const mismatches: MismatchRecord[] = await prisma.$queryRaw`
		SELECT
			p.id,
			p."registrationCode",
			p."firstName",
			p."familyName",
			p."eventId",
			p."tenantId",
			p."participantTypeId",
			pt.name AS "participantTypeName",
			s.name AS "stepName",
			wpt.name AS "workflowParticipantTypeName"
		FROM "Participant" p
		JOIN "Step" s ON s.id = p."stepId"
		JOIN "Workflow" w ON w.id = s."workflowId"
		JOIN "ParticipantType" pt ON pt.id = p."participantTypeId"
		JOIN "ParticipantType" wpt ON wpt.id = w."participantTypeId"
		WHERE p."deletedAt" IS NULL
			AND p."participantTypeId" != w."participantTypeId"
	`

	if (mismatches.length === 0) {
		console.log(chalk.green('No mismatches found. All participants are correctly assigned.'))
		return
	}

	console.log(chalk.yellow(`Found ${mismatches.length} participant(s) with step mismatches.\n`))

	// Build a step cache to avoid repeated queries for the same workflow+step
	const stepCache = new Map<string, { id: string; name: string } | null>()
	const workflowCache = new Map<string, { id: string; name: string } | null>()

	const fixable: Array<{ participantId: string; newStepId: string; participantTypeName: string; stepName: string; workflowName: string }> = []
	const unfixable: Array<{ participantId: string; details: string; reason: string }> = []

	for (const p of mismatches) {
		const workflowKey = `${p.tenantId}:${p.eventId}:${p.participantTypeId}`

		if (!workflowCache.has(workflowKey)) {
			workflowCache.set(workflowKey, await prisma.workflow.findFirst({
				where: {
					tenantId: p.tenantId,
					eventId: p.eventId,
					participantTypeId: p.participantTypeId,
				},
				select: { id: true, name: true },
			}))
		}

		const correctWorkflow = workflowCache.get(workflowKey)

		if (!correctWorkflow) {
			unfixable.push({
				participantId: p.id,
				details: `${p.registrationCode} (${p.firstName} ${p.familyName})`,
				reason: `No workflow for type "${p.participantTypeName}" in this event`,
			})
			continue
		}

		const stepKey = `${correctWorkflow.id}:${p.stepName}`

		if (!stepCache.has(stepKey)) {
			stepCache.set(stepKey, await prisma.step.findFirst({
				where: {
					workflowId: correctWorkflow.id,
					name: p.stepName,
				},
				select: { id: true, name: true },
			}))
		}

		const matchingStep = stepCache.get(stepKey)

		if (!matchingStep) {
			unfixable.push({
				participantId: p.id,
				details: `${p.registrationCode} (${p.firstName} ${p.familyName})`,
				reason: `No step named "${p.stepName}" in workflow "${correctWorkflow.name}"`,
			})
			continue
		}

		fixable.push({
			participantId: p.id,
			newStepId: matchingStep.id,
			participantTypeName: p.participantTypeName,
			stepName: p.stepName,
			workflowName: correctWorkflow.name,
		})
	}

	// Show summary grouped by type + step instead of listing every record
	if (fixable.length > 0) {
		console.log(chalk.green(`Fixable (${fixable.length}):`))
		const summary = new Map<string, number>()
		for (const f of fixable) {
			const key = `${f.participantTypeName} -> "${f.stepName}" in "${f.workflowName}"`
			summary.set(key, (summary.get(key) ?? 0) + 1)
		}
		for (const [label, count] of summary) {
			console.log(chalk.cyan(`  ${count} participant(s): ${label}`))
		}
	}

	if (unfixable.length > 0) {
		console.log(chalk.red(`\nUnfixable (${unfixable.length}) - require manual intervention:`))
		const summary = new Map<string, number>()
		for (const u of unfixable) {
			summary.set(u.reason, (summary.get(u.reason) ?? 0) + 1)
		}
		for (const [reason, count] of summary) {
			console.log(chalk.gray(`  ${count} participant(s): ${reason}`))
		}
	}

	if (fixable.length === 0) {
		console.log(chalk.yellow('\nNo automatically fixable mismatches. Review unfixable records manually.'))
		return
	}

	const { confirm } = await prompts({
		type: 'confirm',
		name: 'confirm',
		message: `Fix ${fixable.length} participant(s) by reassigning their stepId?`,
		initial: false,
	})

	if (!confirm) {
		console.log(chalk.gray('Aborted.'))
		return
	}

	// Group by newStepId for bulk updates
	const byNewStep = new Map<string, string[]>()
	for (const f of fixable) {
		const ids = byNewStep.get(f.newStepId) ?? []
		ids.push(f.participantId)
		byNewStep.set(f.newStepId, ids)
	}

	let fixed = 0
	for (const [newStepId, participantIds] of byNewStep) {
		// Process in batches
		for (let i = 0; i < participantIds.length; i += BATCH_SIZE) {
			const batch = participantIds.slice(i, i + BATCH_SIZE)
			const result = await prisma.participant.updateMany({
				where: { id: { in: batch } },
				data: { stepId: newStepId },
			})
			fixed += result.count
			console.log(chalk.gray(`  Updated ${fixed}/${fixable.length}...`))
		}
	}

	console.log(chalk.green(`\nFixed ${fixed} participant(s).`))
	if (unfixable.length > 0) {
		console.log(chalk.yellow(`${unfixable.length} participant(s) still need manual attention.`))
	}
}

main()
	.catch((e) => {
		console.error(chalk.red('Error:'), e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
