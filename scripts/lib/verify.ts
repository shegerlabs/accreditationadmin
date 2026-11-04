// lib/verify.ts
// Post-run verification shared by `reset-for-event` and `setup-event`.
//
// Both scripts assert the same two things: purged tables are empty, retained
// tables are untouched. They differ only in what the run itself is expected to
// have created, so those exceptions are parameters rather than a second copy.

import { type PrismaClient } from '@prisma/client'
import {
	PURGED_TABLES,
	RETAINED_TABLES,
	type TableName,
	countRows,
} from './purge.js'
import { RETAINED_USERNAMES } from './users.js'

export interface VerifyOptions {
	/** Row counts taken before the run, from `collectSurvey`. */
	before: Record<string, number>
	/**
	 * Purged tables the run legitimately repopulated, e.g. the one Event that
	 * `setup-event` creates. Anything not listed must be empty.
	 */
	expectedPurged?: Partial<Record<TableName, number>>
	/**
	 * Purged tables whose final count varies with configuration and so is not
	 * asserted — `step`, whose count depends on which template was cloned.
	 */
	unassertedPurged?: readonly TableName[]
	/**
	 * Retained tables this run deliberately rewrites. The caller asserts these
	 * itself; listing them here stops the generic "should be untouched" check
	 * from firing.
	 */
	rewrittenRetained?: readonly TableName[]
}

/**
 * Returns the after-counts and a list of problems. An empty list means the
 * database is in the expected state.
 */
export async function verifyPurge(
	prisma: PrismaClient,
	options: VerifyOptions,
) {
	const {
		before,
		expectedPurged = {},
		unassertedPurged = [],
		rewrittenRetained = [],
	} = options

	const after = await countRows(prisma, [...PURGED_TABLES, ...RETAINED_TABLES])
	const problems: string[] = []

	for (const table of PURGED_TABLES) {
		if (unassertedPurged.includes(table)) continue
		const expected = expectedPurged[table] ?? 0
		if (after[table] !== expected) {
			problems.push(`${table}: expected ${expected}, found ${after[table]}`)
		}
	}

	for (const table of RETAINED_TABLES) {
		if (rewrittenRetained.includes(table)) continue
		// Compared unconditionally: a table that was empty before must still be
		// empty, so an unexpected insertion is caught rather than skipped.
		if (after[table] !== before[table]) {
			problems.push(
				`${table} should be untouched: had ${before[table]}, now ${after[table]}`,
			)
		}
	}

	// The surviving accounts must be EXACTLY the allow-list: no extras that
	// should have gone, and none of the protected accounts missing.
	const survivors = await prisma.user.findMany({ select: { username: true } })
	const surviving = new Set(survivors.map(u => u.username))
	const expected = new Set<string>(RETAINED_USERNAMES)

	const missing = [...expected].filter(u => !surviving.has(u))
	if (missing.length > 0) {
		problems.push(`protected accounts were deleted: ${missing.join(', ')}`)
	}
	const unexpected = [...surviving].filter(u => !expected.has(u))
	if (unexpected.length > 0) {
		problems.push(
			`${unexpected.length} account(s) should have been deleted but remain: ` +
				unexpected.slice(0, 10).join(', ') +
				(unexpected.length > 10 ? ', ...' : ''),
		)
	}

	return { after, problems, staffAfter: surviving.size }
}

/** Print problems and set a failing exit code. Returns true if the run passed. */
export function reportVerification(problems: string[]) {
	if (problems.length === 0) return true
	console.error('\nVERIFICATION FAILED:')
	for (const p of problems) console.error(`  - ${p}`)
	process.exitCode = 1
	return false
}
