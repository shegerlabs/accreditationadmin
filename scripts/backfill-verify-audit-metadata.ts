#!/usr/bin/env node

import { Prisma, PrismaClient } from '@prisma/client'
import chalk from 'chalk'
import prompts from 'prompts'

const prisma = new PrismaClient()
const BATCH_SIZE = 100

async function main() {
	console.log(chalk.bold('\nBackfill VERIFY Audit Log Metadata'))
	console.log(
		chalk.gray(
			'Updates VERIFY audit entries that have an entityId but missing or incomplete metadata.\n',
		),
	)

	// Find all VERIFY audit entries with an entityId, then filter in JS
	// for those missing metadata or missing the 'session' field
	const allEntries = await prisma.auditLog.findMany({
		where: {
			action: 'VERIFY',
			entityType: 'PARTICIPANT',
			entityId: { not: null },
		},
		select: {
			id: true,
			entityId: true,
			description: true,
			metadata: true,
		},
	})

	const legacyEntries = allEntries.filter(entry => {
		const meta = entry.metadata as Record<string, any> | null
		return !meta || !('session' in meta)
	})

	if (legacyEntries.length === 0) {
		console.log(
			chalk.green('No legacy VERIFY entries found. All entries already have metadata.'),
		)
		return
	}

	console.log(
		chalk.yellow(
			`Found ${legacyEntries.length} VERIFY audit entries without metadata.\n`,
		),
	)

	// Collect unique participant IDs
	const participantIds = [
		...new Set(legacyEntries.map(e => e.entityId).filter(Boolean)),
	] as string[]

	console.log(
		chalk.gray(
			`Looking up ${participantIds.length} unique participant(s)...\n`,
		),
	)

	// Batch-fetch participants
	const participants = await prisma.participant.findMany({
		where: { id: { in: participantIds } },
		select: {
			id: true,
			firstName: true,
			familyName: true,
			registrationCode: true,
			attendClosedSession: true,
			attendExecutiveCouncilClosedSession: true,
			participantType: { select: { name: true } },
		},
	})

	const participantMap = new Map(participants.map(p => [p.id, p]))

	function getSession(p: { attendClosedSession: boolean; attendExecutiveCouncilClosedSession: boolean }) {
		return p.attendExecutiveCouncilClosedSession ? 'executive' : p.attendClosedSession ? 'closed' : 'open'
	}

	const updates: Array<{
		id: string
		metadata: Record<string, any>
	}> = []

	let matched = 0
	let unmatched = 0

	for (const entry of legacyEntries) {
		const participant = participantMap.get(entry.entityId!)
		const existing = (entry.metadata as Record<string, any>) ?? null

		if (participant) {
			matched++
			updates.push({
				id: entry.id,
				metadata: {
					...(existing ?? {}),
					result: existing?.result ?? 'valid',
					registrationCode: existing?.registrationCode ?? participant.registrationCode,
					firstName: existing?.firstName ?? participant.firstName,
					familyName: existing?.familyName ?? participant.familyName,
					participantType: existing?.participantType ?? participant.participantType?.name ?? null,
					session: getSession(participant),
				},
			})
		} else {
			unmatched++
			// Participant may have been deleted; try to extract name from description
			const nameMatch = entry.description.match(
				/^Badge verified for (.+?) at checkpoint$/,
			)
			if (nameMatch) {
				const nameParts = nameMatch[1].trim().split(' ')
				const firstName = nameParts[0] ?? ''
				const familyName = nameParts.slice(1).join(' ')
				updates.push({
					id: entry.id,
					metadata: {
						...(existing ?? {}),
						result: existing?.result ?? 'valid',
						firstName: existing?.firstName ?? firstName,
						familyName: existing?.familyName ?? familyName,
						registrationCode: existing?.registrationCode ?? null,
						participantType: existing?.participantType ?? null,
						session: existing?.session ?? null,
					},
				})
			} else {
				updates.push({
					id: entry.id,
					metadata: {
						...(existing ?? {}),
						result: existing?.result ?? 'valid',
						firstName: existing?.firstName ?? null,
						familyName: existing?.familyName ?? null,
						registrationCode: existing?.registrationCode ?? null,
						participantType: existing?.participantType ?? null,
						session: existing?.session ?? null,
					},
				})
			}
		}
	}

	console.log(chalk.cyan(`  ${matched} entries matched to existing participants`))
	if (unmatched > 0) {
		console.log(
			chalk.yellow(
				`  ${unmatched} entries have deleted/missing participants (name parsed from description)`,
			),
		)
	}

	const { confirm } = await prompts({
		type: 'confirm',
		name: 'confirm',
		message: `Update metadata on ${updates.length} audit entries?`,
		initial: false,
	})

	if (!confirm) {
		console.log(chalk.gray('Aborted.'))
		return
	}

	let updated = 0
	for (let i = 0; i < updates.length; i += BATCH_SIZE) {
		const batch = updates.slice(i, i + BATCH_SIZE)
		await prisma.$transaction(
			batch.map(entry =>
				prisma.auditLog.update({
					where: { id: entry.id },
					data: { metadata: entry.metadata },
				}),
			),
		)
		updated += batch.length
		console.log(chalk.gray(`  Updated ${updated}/${updates.length}...`))
	}

	console.log(chalk.green(`\nDone. Updated ${updated} audit entries.`))
}

main()
	.catch(e => {
		console.error(chalk.red('Error:'), e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
