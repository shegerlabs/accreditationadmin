// reset-for-event.ts
// Wipe event-specific data from the database, retaining all configuration and
// reference data. Leaves the database empty of events — use `setup-event` if you
// want to purge AND seed a new organ's event in one atomic step.
//
// USAGE:
//   npm run reset-for-event                 # DRY RUN (default) - shows counts, deletes nothing
//   npm run reset-for-event -- --confirm    # Take a backup, then purge
//
// SPEC:
//   docs/superpowers/specs/2026-07-17-live-db-event-reset-design.md
//
// SAFETY:
//   - Dry run is the default. Nothing is deleted without --confirm.
//   - --confirm runs scripts/accreditation.sh FIRST and aborts the purge if the
//     backup fails. No verified backup, no purge.
//   - The purge runs in a single transaction; any error rolls it all back.
//
// NOTES:
//   - This script is destructive and NOT idempotent in effect (though re-running
//     after a successful purge is harmless: everything is already gone).
//   - Registrants are identified by ROLE, never by "has no participants" —
//     staff accounts also have zero participants.

import { PrismaClient } from '@prisma/client'
import { runBackupGate } from './lib/backup.js'
import { confirmDatabaseName } from './lib/confirm.js'
import {
	assertNoBlockingBackupRows,
	assertSchemaMatches,
	collectSurvey,
	printSurvey,
	purgeEventData,
} from './lib/purge.js'
import { describeTarget, printBanner } from './lib/target.js'
import { assertRetainedUsersExist } from './lib/users.js'
import { reportVerification, verifyPurge } from './lib/verify.js'

const prisma = new PrismaClient()

/** Interactive transactions default to 5s, which the audit-log delete alone can exceed. */
const TRANSACTION_OPTIONS = { maxWait: 30_000, timeout: 600_000 }

async function main() {
	const confirm = process.argv.includes('--confirm')
	const target = describeTarget()

	printBanner(
		confirm ? 'RESET FOR EVENT — LIVE RUN' : 'RESET FOR EVENT — DRY RUN',
		target,
	)

	await assertSchemaMatches(prisma, target.name)

	const survey = await collectSurvey(prisma)
	printSurvey(survey)

	if (!confirm) {
		console.log('\nDry run — nothing was deleted.')
		console.log('Re-run with --confirm to take a backup and purge.\n')
		return
	}

	// --- Guards -------------------------------------------------------------
	// A typo in the allow-list deletes the account it was meant to protect, so
	// prove every protected username exists before anything is destroyed.
	await assertRetainedUsersExist(prisma)
	await assertNoBlockingBackupRows(prisma)

	const confirmed = await confirmDatabaseName(
		target.name,
		`Type the database name to confirm permanent deletion of ${survey.before.participant} participant(s) and ${survey.before.auditLog} audit log(s)`,
	)
	if (!confirmed) {
		process.exitCode = 1
		return
	}

	// --- Backup gate --------------------------------------------------------
	runBackupGate()

	// --- Purge --------------------------------------------------------------
	console.log('\nPurging...')
	await prisma.$transaction(async tx => purgeEventData(tx), TRANSACTION_OPTIONS)

	// --- Verify -------------------------------------------------------------
	// Nothing is expected to survive in the purged tables, and every retained
	// table must be byte-for-byte the count it started at.
	const { problems, staffAfter } = await verifyPurge(prisma, {
		before: survey.before,
	})

	if (!reportVerification(problems)) return

	console.log('\nPurge complete and verified.')
	console.log(`  ${staffAfter} accounts retained.`)
	console.log('\nNext steps:')
	console.log(
		'  1. Re-clone workflows for the new event from WorkflowTemplate,',
	)
	console.log(
		'     or run `npm run setup-event` to purge and seed in one step.',
	)
	console.log(
		'  2. Re-assign validators/printers to steps (UserEventAccess was cascaded).',
	)
	console.log('  3. Schedule orphan blob reconciliation in Azure (see spec).')
	console.log('  4. Staff must log in again; all sessions were cleared.\n')
}

main()
	.catch(e => {
		console.error(`\n${e instanceof Error ? e.message : String(e)}`)
		process.exitCode = 1
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
