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

/**
 * A printer's reprint is a PRINT approval like any other; this start of its
 * remarks is the only thing that tells it apart from a first print.
 */
export const REPRINT_REMARK_PREFIX = 'Printer reprint:'

export function isIssued(status: string) {
	return (ISSUED_STATUSES as readonly string[]).includes(status)
}
