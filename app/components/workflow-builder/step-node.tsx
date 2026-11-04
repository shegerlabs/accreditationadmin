import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Action } from '@prisma/client'
import { Link } from '@remix-run/react'
import {
	CheckCircle,
	XCircle,
	Bell,
	Printer,
	PackageCheck,
	Archive,
	Ban,
	SkipForward,
	Flag,
	Zap,
	Pencil,
	RefreshCw,
} from 'lucide-react'
import { cn } from '~/utils/misc'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { SlaIndicator } from '~/components/sla-status-badge'
import { StepData } from './types'

const ACTION_STYLES: Record<
	Action,
	{
		icon: React.ComponentType<{ className?: string }>
		bgColor: string
		borderColor: string
		iconColor: string
	}
> = {
	APPROVE: {
		icon: CheckCircle,
		bgColor: 'bg-green-50',
		borderColor: 'border-green-400',
		iconColor: 'text-green-600',
	},
	REJECT: {
		icon: XCircle,
		bgColor: 'bg-red-50',
		borderColor: 'border-red-400',
		iconColor: 'text-red-600',
	},
	NOTIFY: {
		icon: Bell,
		bgColor: 'bg-blue-50',
		borderColor: 'border-blue-400',
		iconColor: 'text-blue-600',
	},
	PRINT: {
		icon: Printer,
		bgColor: 'bg-purple-50',
		borderColor: 'border-purple-400',
		iconColor: 'text-purple-600',
	},
	COLLECT: {
		icon: PackageCheck,
		bgColor: 'bg-amber-50',
		borderColor: 'border-amber-400',
		iconColor: 'text-amber-600',
	},
	ARCHIVE: {
		icon: Archive,
		bgColor: 'bg-gray-100',
		borderColor: 'border-gray-400',
		iconColor: 'text-gray-600',
	},
	CANCEL: {
		icon: Ban,
		bgColor: 'bg-orange-50',
		borderColor: 'border-orange-400',
		iconColor: 'text-orange-600',
	},
	BYPASS: {
		icon: SkipForward,
		bgColor: 'bg-yellow-50',
		borderColor: 'border-yellow-400',
		iconColor: 'text-yellow-600',
	},
	REPRINT: {
		icon: RefreshCw,
		bgColor: 'bg-amber-50',
		borderColor: 'border-amber-400',
		iconColor: 'text-amber-600',
	},
}

interface StepNodeProps {
	data: StepData
	selected?: boolean
}

export const StepNode = memo(({ data, selected }: StepNodeProps) => {
	const style = ACTION_STYLES[data.action]
	const Icon = style.icon
	// REJECT and BYPASS nodes redirect to targets, so they're not really "final"
	const isSpecialAction = data.action === 'REJECT' || data.action === 'BYPASS'
	const isTerminal = !data.nextStepId && !isSpecialAction

	// Use dynamic width from data, fallback to 250px
	const nodeWidth = data.nodeWidth || 250

	return (
		<div
			style={{ width: nodeWidth }}
			className={cn(
				'min-h-[120px] rounded-lg border-2 shadow-sm transition-all',
				style.bgColor,
				style.borderColor,
				selected && 'ring-2 ring-primary ring-offset-2',
			)}
		>
			{/* Target handle (incoming edge) */}
			<Handle
				type="target"
				position={Position.Top}
				className="!h-3 !w-3 !border-2 !border-muted-foreground !bg-background"
			/>

			<div className="p-3">
				{/* Header with icon, name, and edit button */}
				<div className="flex items-center gap-2">
					<div className={cn('rounded-md p-1.5', style.bgColor)}>
						<Icon className={cn('h-4 w-4', style.iconColor)} />
					</div>
					<span className="flex-1 font-medium text-sm truncate">
						{data.name}
					</span>
					<Badge
						variant="outline"
						className={cn('text-xs', style.borderColor, style.iconColor)}
					>
						{data.action}
					</Badge>
					{data.baseUrl && (
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6 shrink-0"
							asChild
						>
							<Link
								to={`${data.baseUrl}/visual/${data.id}`}
								onClick={e => e.stopPropagation()}
							>
								<Pencil className="h-3 w-3" />
								<span className="sr-only">Edit step</span>
							</Link>
						</Button>
					)}
				</div>

				{/* Role and order info */}
				<div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
					<span className="truncate">Role: {data.roleName}</span>
					<span>Order: {data.order}</span>
				</div>

				{/* SLA indicator */}
				{data.slaDurationMinutes && (
					<div className="mt-1">
						<SlaIndicator slaDurationMinutes={data.slaDurationMinutes} />
					</div>
				)}

				{/* Special step indicators */}
				<div className="mt-2 flex flex-wrap gap-1">
					{data.isRejectionTarget && (
						<div className="flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
							<Flag className="h-3 w-3" />
							<span>Rejection Target</span>
						</div>
					)}
					{data.isBypassTarget && (
						<div className="flex items-center gap-1 rounded bg-cyan-100 px-2 py-0.5 text-xs text-cyan-700">
							<Zap className="h-3 w-3" />
							<span>Bypass Target</span>
						</div>
					)}
					{isTerminal && (
						<div className="rounded bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
							Final Step
						</div>
					)}
				</div>
			</div>

			{/* Source handle (outgoing edge) */}
			<Handle
				type="source"
				position={Position.Bottom}
				className="!h-3 !w-3 !border-2 !border-primary !bg-primary"
			/>
		</div>
	)
})

StepNode.displayName = 'StepNode'
