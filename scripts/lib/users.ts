// lib/users.ts
// Which accounts survive a purge.
//
// POLICY CHANGE (2026-09-03): retention used to be role-based — anything whose
// only role was `user` was deleted, everything else survived. That kept 188
// accounts, including 159 focal points belonging to the previous event's
// delegations. Retention is now an explicit allow-list of usernames instead, so
// a new event starts from a known-good set of operators rather than inheriting
// whoever happened to hold a role.
//
// This deliberately supersedes the "identified by ROLE" note in
// docs/superpowers/specs/2026-07-17-live-db-event-reset-design.md.
//
// Roles and permissions themselves are untouched: they live in their own
// tables and are asserted unchanged by the verification step. Only the
// User rows and their role ASSIGNMENTS go.

import { type Prisma, type PrismaClient } from '@prisma/client'

/**
 * The only accounts that survive a purge. Everything else is deleted.
 *
 * An allow-list is safer than a deny-list here — a role that gets added later
 * cannot accidentally grant survival — but it has one sharp edge: a typo means
 * an account you meant to keep is silently destroyed. `assertRetainedUsersExist`
 * exists to make that impossible, and runs before the point of no return.
 */
export const RETAINED_USERNAMES = [
	'admin',
	'tenantadmin',
	'firstvalidator',
	'secondvalidator',
	'badgeprinter',
	'dispatcher',
	'checker',
	'focal',
] as const

/** Matches every user that is NOT on the allow-list, i.e. everything to delete. */
export const doomedUserWhere: Prisma.UserWhereInput = {
	username: { notIn: [...RETAINED_USERNAMES] },
}

/**
 * Refuse to run if any allow-listed username is absent.
 *
 * Without this, a typo in RETAINED_USERNAMES ("focals") silently deletes the
 * account it was meant to protect, and the purge is irreversible.
 */
export async function assertRetainedUsersExist(prisma: PrismaClient) {
	const found = await prisma.user.findMany({
		where: { username: { in: [...RETAINED_USERNAMES] } },
		select: { username: true },
	})
	const present = new Set(found.map(u => u.username))
	const missing = RETAINED_USERNAMES.filter(u => !present.has(u))
	if (missing.length > 0) {
		throw new Error(
			`${missing.length} allow-listed account(s) do not exist: ${missing.join(', ')}.\n` +
				`Either the username is wrong in scripts/lib/users.ts or the account is ` +
				`missing from this database. Refusing to purge — a typo here deletes the ` +
				`account it was meant to protect.`,
		)
	}
}

/** The surviving accounts and their roles, for the pre-purge survey. */
export async function describeRetainedUsers(prisma: PrismaClient) {
	const users = await prisma.user.findMany({
		where: { username: { in: [...RETAINED_USERNAMES] } },
		select: {
			username: true,
			status: true,
			roles: { select: { name: true }, orderBy: { name: 'asc' } },
		},
		orderBy: { username: 'asc' },
	})
	return users.map(u => ({
		username: u.username,
		status: u.status,
		roles: u.roles.map(r => r.name),
	}))
}
