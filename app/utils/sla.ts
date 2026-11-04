import { differenceInMinutes } from 'date-fns'

export type SlaStatus = 'on_time' | 'warning' | 'overdue' | 'no_sla'

export interface SlaInfo {
	status: SlaStatus
	minutesElapsed: number
	minutesRemaining: number | null
	slaDurationMinutes: number | null
	percentageUsed: number | null
}

/**
 * Calculate the SLA status for a participant at a workflow step
 *
 * @param stepEnteredAt - When the participant entered the current step
 * @param slaDurationMinutes - The SLA duration in minutes (null = no SLA)
 * @param warningThreshold - Percentage of SLA time that triggers warning status (default: 75)
 * @returns SlaInfo object with status and timing details
 */
export function calculateSlaStatus(
	stepEnteredAt: Date,
	slaDurationMinutes: number | null,
	warningThreshold: number = 75,
): SlaInfo {
	const now = new Date()
	const minutesElapsed = differenceInMinutes(now, stepEnteredAt)

	// No SLA configured
	if (slaDurationMinutes === null || slaDurationMinutes === 0) {
		return {
			status: 'no_sla',
			minutesElapsed,
			minutesRemaining: null,
			slaDurationMinutes: null,
			percentageUsed: null,
		}
	}

	const minutesRemaining = slaDurationMinutes - minutesElapsed
	const percentageUsed = (minutesElapsed / slaDurationMinutes) * 100

	let status: SlaStatus
	if (percentageUsed >= 100) {
		status = 'overdue'
	} else if (percentageUsed >= warningThreshold) {
		status = 'warning'
	} else {
		status = 'on_time'
	}

	return {
		status,
		minutesElapsed,
		minutesRemaining,
		slaDurationMinutes,
		percentageUsed,
	}
}

/**
 * Format a duration in minutes into a human-readable string
 *
 * @param minutes - The duration in minutes (can be negative for overdue)
 * @returns A formatted string like "5m", "2h 30m", "1d 4h"
 */
export function formatDuration(minutes: number): string {
	const absMinutes = Math.abs(minutes)
	const isNegative = minutes < 0

	if (absMinutes < 60) {
		const formatted = `${Math.round(absMinutes)}m`
		return isNegative ? `-${formatted}` : formatted
	}

	if (absMinutes < 1440) {
		// Less than 24 hours
		const hours = Math.floor(absMinutes / 60)
		const remainingMinutes = Math.round(absMinutes % 60)
		const formatted =
			remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
		return isNegative ? `-${formatted}` : formatted
	}

	// 24 hours or more
	const days = Math.floor(absMinutes / 1440)
	const remainingHours = Math.floor((absMinutes % 1440) / 60)
	const formatted =
		remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
	return isNegative ? `-${formatted}` : formatted
}

/**
 * Get the CSS classes for an SLA status badge
 *
 * @param status - The SLA status
 * @returns An object with background, text, and border CSS classes
 */
export function getSlaStatusColors(status: SlaStatus): {
	bg: string
	text: string
	border: string
} {
	switch (status) {
		case 'on_time':
			return {
				bg: 'bg-green-100',
				text: 'text-green-800',
				border: 'border-green-200',
			}
		case 'warning':
			return {
				bg: 'bg-amber-100',
				text: 'text-amber-800',
				border: 'border-amber-200',
			}
		case 'overdue':
			return {
				bg: 'bg-red-100',
				text: 'text-red-800',
				border: 'border-red-200',
			}
		case 'no_sla':
		default:
			return {
				bg: 'bg-gray-100',
				text: 'text-gray-500',
				border: 'border-gray-200',
			}
	}
}
