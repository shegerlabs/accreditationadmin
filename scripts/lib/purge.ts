// lib/purge.ts
// The event-data purge, shared by `reset-for-event` and `setup-event`.
//
// SPEC:
//   docs/superpowers/specs/2026-07-17-live-db-event-reset-design.md

import { type Prisma, type PrismaClient } from '@prisma/client'
import {
	RETAINED_USERNAMES,
	describeRetainedUsers,
	doomedUserWhere,
} from './users.js'

/**
 * Must be empty after the purge.
 *
 * Everything below `event` is deleted by the FK cascade, not by an explicit
 * statement. The list is the full transitive CASCADE closure from Event,
 * derived from the live schema's foreign keys — keep it in sync, because a
 * table missing here is a table the dry run silently fails to warn about.
 */
export const PURGED_TABLES = [
	'auditLog',
	'event',
	// Direct children of Event.
	'meeting',
	'restriction',
	'workflow',
	'invitation',
	'participant',
	'template',
	'userEventAccess',
	// Transitive: Restriction -> Constraint, Invitation -> InvitationConstraint,
	// Workflow -> Step, Template -> Attachment, Participant -> Approval/Document.
	'constraint',
	'invitationConstraint',
	'step',
	'attachment',
	'approval',
	'participantDocument',
	// Deleted explicitly, not by cascade.
	'session',
	'verification',
] as const

/** Must survive the purge. Config and reference data. */
export const RETAINED_TABLES = [
	'tenant',
	'country',
	'title',
	'participantType',
	'meetingType',
	'venue',
	'role',
	'permission',
	'menu',
	'menuItem',
	'badgeTemplate',
	'workflowTemplate',
	'stepTemplate',
	'systemSetting',
	'databaseBackup',
	// CustomReport cascades from User.createdById, so a report owned by a
	// deleted account would go with it. Listed here so the count is visible and
	// any change is caught by verification rather than passing unnoticed.
	'customReport',
] as const

export type TableName =
	| (typeof PURGED_TABLES)[number]
	| (typeof RETAINED_TABLES)[number]

export async function countRows(
	prisma: PrismaClient,
	tables: readonly TableName[],
) {
	const counts: Record<string, number> = {}
	for (const table of tables) {
		// @ts-expect-error - dynamic model access is intentional here
		counts[table] = await prisma[table].count()
	}
	return counts
}

export function printCounts(title: string, counts: Record<string, number>) {
	console.log(`\n${title}`)
	const width = Math.max(...Object.keys(counts).map(k => k.length))
	for (const [table, count] of Object.entries(counts)) {
		console.log(`  ${table.padEnd(width)}  ${String(count).padStart(8)}`)
	}
}

/**
 * A missing table means this DB does not match prisma/schema.prisma, i.e. it is
 * not the database this codebase targets. Fail loudly rather than reporting a
 * confusing per-table Prisma error mid-survey.
 */
export async function assertSchemaMatches(
	prisma: PrismaClient,
	databaseName: string,
) {
	const expected = [...PURGED_TABLES, ...RETAINED_TABLES]
	const presentRows = await prisma.$queryRaw<Array<{ table_name: string }>>`
		SELECT table_name FROM information_schema.tables
		WHERE table_schema = 'public' AND table_type = 'BASE TABLE';`
	const present = new Set(presentRows.map(r => r.table_name.toLowerCase()))
	const absent = expected.filter(t => !present.has(t.toLowerCase()))
	if (absent.length > 0) {
		throw new Error(
			`Database "${databaseName}" is missing ${absent.length} table(s) that ` +
				`prisma/schema.prisma defines: ${absent.join(', ')}.\n` +
				`This is not the database this codebase targets. Check DATABASE_URL — ` +
				`this server hosts more than one accreditation database.`,
		)
	}
}

/**
 * DatabaseBackup.createdById declares no onDelete rule, so it defaults to
 * restrict and would abort the transaction. Registrants should never own a
 * backup; verify rather than assume.
 */
export async function assertNoBlockingBackupRows(prisma: PrismaClient) {
	const blocking = await prisma.databaseBackup.count({
		where: { createdBy: doomedUserWhere },
	})
	if (blocking > 0) {
		throw new Error(
			`${blocking} DatabaseBackup row(s) are owned by accounts this purge would ` +
				`delete. DatabaseBackup.createdById has no cascade rule and would block ` +
				`deletion. Reassign those backup rows to an allow-listed account first.`,
		)
	}
}

export interface Survey {
	before: Record<string, number>
	/** Accounts that will be deleted. */
	deletedUserCount: number
	/** Accounts that will survive — always exactly the allow-list. */
	retainedUsers: Array<{ username: string; status: string; roles: string[] }>
}

/** Gather the "what goes, what stays" numbers. Reads only; prints nothing. */
export async function collectSurvey(prisma: PrismaClient): Promise<Survey> {
	const before = await countRows(prisma, [...PURGED_TABLES, ...RETAINED_TABLES])
	const deletedUserCount = await prisma.user.count({ where: doomedUserWhere })
	const retainedUsers = await describeRetainedUsers(prisma)

	return { before, deletedUserCount, retainedUsers }
}

/** Print a survey gathered by `collectSurvey`. */
export function printSurvey(survey: Survey) {
	printCounts(
		'WILL BE DELETED:',
		Object.fromEntries(PURGED_TABLES.map(t => [t, survey.before[t]!])),
	)
	console.log(
		`  ${'user'.padEnd(20)}  ${String(survey.deletedUserCount).padStart(8)}`,
	)

	printCounts(
		'WILL BE RETAINED:',
		Object.fromEntries(RETAINED_TABLES.map(t => [t, survey.before[t]!])),
	)
	console.log(
		`  ${'user'.padEnd(20)}  ${String(survey.retainedUsers.length).padStart(8)}`,
	)

	// Role and Permission ROWS are retained; only the assignments held by
	// deleted users go. Listing each survivor's roles makes that concrete.
	console.log(
		`\nThe ONLY accounts that will survive (${RETAINED_USERNAMES.length}):`,
	)
	for (const user of survey.retainedUsers) {
		console.log(
			`  ${user.username.padEnd(18)} ${user.status.padEnd(8)} [${user.roles.join(', ')}]`,
		)
	}

	console.log(
		'\nNOTE: audit logs are included in the purge. The approval history',
	)
	console.log('      of every past participant will be destroyed.')
}

/**
 * Delete all event-scoped data. Must be called inside a transaction so a later
 * failure rolls the whole thing back.
 *
 * The Tenant row is deliberately never deleted: User.tenantId cascades, so
 * dropping the tenant would take every staff account with it.
 */
export async function purgeEventData(tx: Prisma.TransactionClient) {
	// 1. Audit logs. Tenant-scoped, so not covered by the Event cascade.
	const audit = await tx.auditLog.deleteMany({})
	console.log(`  auditLog                 ${audit.count}`)

	// 2. Events. Cascades to meetings, restrictions, workflows -> steps,
	//    invitations -> constraints, participants -> approvals + documents,
	//    templates -> attachments, and userEventAccess.
	const events = await tx.event.deleteMany({})
	console.log(`  event (+ cascade)        ${events.count}`)

	// 3. Every account not on the allow-list. Cascades their sessions, password,
	//    image, role assignments and UserEventAccess rows. The Role and
	//    Permission tables themselves are untouched.
	const users = await tx.user.deleteMany({ where: doomedUserWhere })
	console.log(`  user                     ${users.count}`)

	// 4. All remaining sessions and verifications, staff included, so no
	//    pre-purge session resumes and no stale code stays redeemable.
	const sessions = await tx.session.deleteMany({})
	const verifications = await tx.verification.deleteMany({})
	console.log(`  session                  ${sessions.count}`)
	console.log(`  verification             ${verifications.count}`)
}
