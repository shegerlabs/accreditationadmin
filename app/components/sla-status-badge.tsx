import { AlertCircle, AlertTriangle, Clock, MinusCircle } from 'lucide-react'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '~/components/ui/tooltip'
import { cn } from '~/utils/misc'
import {
	formatDuration,
	getSlaStatusColors,
	type SlaInfo,
	type SlaStatus,
} from '~/utils/sla'

interface SlaStatusBadgeProps {
	slaInfo: SlaInfo
	showLabel?: boolean
	className?: string
}

const statusIcons: Record<SlaStatus, typeof Clock> = {
	on_time: Clock,
	warning: AlertTriangle,
	overdue: AlertCircle,
	no_sla: MinusCircle,
}

const statusLabels: Record<SlaStatus, string> = {
	on_time: 'On Time',
	warning: 'Warning',
	overdue: 'Overdue',
	no_sla: 'No SLA',
}

export function SlaStatusBadge({
	slaInfo,
	showLabel = true,
	className,
}: SlaStatusBadgeProps) {
	const { status, minutesElapsed, minutesRemaining, slaDurationMinutes } =
		slaInfo
	const colors = getSlaStatusColors(status)
	const Icon = statusIcons[status]

	const tooltipContent = () => {
		if (status === 'no_sla') {
			return (
				<div className="text-sm">
					<p className="font-medium">No SLA configured</p>
					<p className="text-muted-foreground">
						Elapsed: {formatDuration(minutesElapsed)}
					</p>
				</div>
			)
		}

		return (
			<div className="space-y-1 text-sm">
				<p className="font-medium">{statusLabels[status]}</p>
				<p>Elapsed: {formatDuration(minutesElapsed)}</p>
				<p>SLA Limit: {formatDuration(slaDurationMinutes!)}</p>
				{status === 'overdue' ? (
					<p className="text-red-600">
						Overdue by: {formatDuration(Math.abs(minutesRemaining!))}
					</p>
				) : (
					<p className="text-green-600">
						Remaining: {formatDuration(minutesRemaining!)}
					</p>
				)}
			</div>
		)
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<div
						className={cn(
							'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
							colors.bg,
							colors.text,
							colors.border,
							className,
						)}
					>
						<Icon className="h-3 w-3" />
						{showLabel && <span>{statusLabels[status]}</span>}
					</div>
				</TooltipTrigger>
				<TooltipContent side="top">{tooltipContent()}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	)
}

interface SlaIndicatorProps {
	slaDurationMinutes: number | null
	className?: string
}

/**
 * Simple indicator showing SLA duration on workflow step nodes
 */
export function SlaIndicator({ slaDurationMinutes, className }: SlaIndicatorProps) {
	if (!slaDurationMinutes) {
		return null
	}

	return (
		<div
			className={cn(
				'inline-flex items-center gap-1 text-xs text-muted-foreground',
				className,
			)}
		>
			<Clock className="h-3 w-3" />
			<span>SLA: {formatDuration(slaDurationMinutes)}</span>
		</div>
	)
}
