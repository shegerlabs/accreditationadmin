import { Action } from '@prisma/client'
import { Link } from '@remix-run/react'
import {
	CheckCircle,
	XCircle,
	Bell,
	Printer,
	Archive,
	SkipForward,
	GripVertical,
	RotateCcw,
	Plus,
	ArrowLeft,
} from 'lucide-react'
import { cn } from '~/utils/misc'
import { Button } from '~/components/ui/button'

// REJECT and BYPASS are also auto-created when flagging targets, but can be manually added too
const STEP_TEMPLATES: Array<{
	action: Action
	label: string
	icon: React.ComponentType<{ className?: string }>
	bgColor: string
	borderColor: string
	iconColor: string
}> = [
	{
		action: 'APPROVE',
		label: 'Approve',
		icon: CheckCircle,
		bgColor: 'bg-green-50 hover:bg-green-100',
		borderColor: 'border-green-300 hover:border-green-400',
		iconColor: 'text-green-600',
	},
	{
		action: 'REJECT',
		label: 'Reject',
		icon: XCircle,
		bgColor: 'bg-red-50 hover:bg-red-100',
		borderColor: 'border-red-300 hover:border-red-400',
		iconColor: 'text-red-600',
	},
	{
		action: 'NOTIFY',
		label: 'Notify',
		icon: Bell,
		bgColor: 'bg-blue-50 hover:bg-blue-100',
		borderColor: 'border-blue-300 hover:border-blue-400',
		iconColor: 'text-blue-600',
	},
	{
		action: 'PRINT',
		label: 'Print',
		icon: Printer,
		bgColor: 'bg-purple-50 hover:bg-purple-100',
		borderColor: 'border-purple-300 hover:border-purple-400',
		iconColor: 'text-purple-600',
	},
	{
		action: 'ARCHIVE',
		label: 'Archive',
		icon: Archive,
		bgColor: 'bg-gray-50 hover:bg-gray-100',
		borderColor: 'border-gray-300 hover:border-gray-400',
		iconColor: 'text-gray-600',
	},
	{
		action: 'BYPASS',
		label: 'Bypass',
		icon: SkipForward,
		bgColor: 'bg-yellow-50 hover:bg-yellow-100',
		borderColor: 'border-yellow-300 hover:border-yellow-400',
		iconColor: 'text-yellow-600',
	},
]

interface StepPaletteProps {
	onDragStart?: (action: Action) => void
	onResetLayout?: () => void
	onAddStep?: () => void
	backUrl?: string
}

export function StepPalette({
	onDragStart,
	onResetLayout,
	onAddStep,
	backUrl,
}: StepPaletteProps) {
	const handleDragStart = (
		e: React.DragEvent<HTMLDivElement>,
		action: Action,
	) => {
		e.dataTransfer.setData('application/workflow-step', action)
		e.dataTransfer.effectAllowed = 'copy'
		onDragStart?.(action)
	}

	return (
		<div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
			{STEP_TEMPLATES.map(template => (
				<div
					key={template.action}
					draggable
					onDragStart={e => handleDragStart(e, template.action)}
					className={cn(
						'flex cursor-grab items-center gap-2 rounded-lg border-2 border-dashed px-3 py-1.5 transition-all',
						'active:cursor-grabbing active:border-solid active:shadow-md',
						template.bgColor,
						template.borderColor,
					)}
				>
					<GripVertical className="h-3 w-3 text-muted-foreground" />
					<template.icon className={cn('h-4 w-4', template.iconColor)} />
					<span className="text-sm font-medium">{template.label}</span>
				</div>
			))}

			{/* Spacer */}
			<div className="flex-1" />

			{/* Action buttons */}
			<Button size="sm" onClick={onResetLayout}>
				<RotateCcw className="mr-2 h-4 w-4" />
				Reset Layout
			</Button>
			<Button size="sm" onClick={onAddStep}>
				<Plus className="mr-2 h-4 w-4" />
				Add Step
			</Button>
			{backUrl && (
				<Button size="sm" asChild>
					<Link to={backUrl}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Link>
				</Button>
			)}
		</div>
	)
}
