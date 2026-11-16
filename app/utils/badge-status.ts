import type { RequestStatus } from '@prisma/client'

/**
 * Statuses of a participant whose badge has been printed and is still valid.
 * Archiving is bookkeeping for admins: an archived badge still passes the
 * checkpoint and can still be reprinted. COLLECTED is no longer set (the
 * dispatcher role was removed) but older records still carry it.
 */
export const ISSUED_STATUSES = [
	'PRINTED',
	'COLLECTED',
	'ARCHIVED',
] as const satisfies readonly RequestStatus[]

export function isIssued(status: string) {
	return (ISSUED_STATUSES as readonly string[]).includes(status)
}
