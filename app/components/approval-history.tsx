import { format } from 'date-fns'
import {
	CheckCircleIcon,
	CircleDashedIcon,
	CircleIcon,
	SkipForwardIcon,
	XCircleIcon,
} from 'lucide-react'
import { Card, CardContent } from '~/components/ui/card'
import { cn } from '~/utils/misc'

type HistoryApproval = {
	id: string
	result: string
	createdAt: string | Date
	stepName: string
	stepAction: string
	username: string
}

type Step = { name: string; action: string; roleName: string }

/**
 * A participant's way through their workflow: what has happened, the step
 * they are waiting at, and (while in progress) the steps still ahead.
 */
export function ApprovalHistory({
	approvals,
	status,
	current,
	upcoming,
	tone = 'blue',
}: {
	approvals: HistoryApproval[] | undefined
	status: string
	current: Step
	upcoming: (Step & { id: string })[]
	tone?: 'blue' | 'slate'
}) {
	const inProgress = status === 'INPROGRESS'
	const blue = tone === 'blue'
	return (
		<div className="mt-6">
			<h2 className="mb-4 text-lg font-semibold text-slate-800">
				Approval History
			</h2>
			<Card>
				<CardContent className="space-y-2 p-4">
					{approvals && approvals.length > 0 ? (
						approvals.map(approval => (
							<div
								key={approval.id}
								className="flex items-center justify-between rounded-lg border bg-white p-3 text-sm shadow-sm"
							>
								<div className="flex items-center gap-3">
									{approval.result === 'SUCCESS' && (
										<CheckCircleIcon className="h-5 w-5 text-emerald-500" />
									)}
									{approval.result === 'FAILURE' && (
										<XCircleIcon className="h-5 w-5 text-red-500" />
									)}
									{approval.result === 'SKIPPED' && (
										<SkipForwardIcon className="h-5 w-5 text-amber-500" />
									)}
									<div>
										<span className="font-medium text-slate-800">
											{approval.stepName}
										</span>
										<span className="ml-2 text-slate-500">
											({approval.stepAction})
										</span>
									</div>
								</div>
								<div className="text-right text-xs text-slate-500">
									<div className="font-medium">{approval.username}</div>
									<div>
										{format(new Date(approval.createdAt), 'MMM d, HH:mm')}
									</div>
								</div>
							</div>
						))
					) : (
						<p className="text-sm text-slate-500">No approval actions yet</p>
					)}

					{inProgress && (
						<div
							className={cn(
								'flex items-center justify-between rounded-lg border-2 border-dashed p-3 text-sm',
								blue
									? 'border-blue-200 bg-blue-50/50'
									: 'border-slate-200 bg-slate-50/50',
							)}
						>
							<div className="flex items-center gap-3">
								<CircleDashedIcon
									className={cn(
										'h-5 w-5',
										blue ? 'text-blue-500' : 'text-slate-500',
									)}
								/>
								<div>
									<span
										className={cn(
											'font-medium',
											blue ? 'text-blue-700' : 'text-slate-700',
										)}
									>
										{current.name}
									</span>
									<span
										className={cn(
											'ml-2',
											blue ? 'text-blue-500' : 'text-slate-500',
										)}
									>
										({current.action})
									</span>
								</div>
							</div>
							<div
								className={cn(
									'text-right text-xs',
									blue ? 'text-blue-600' : 'text-slate-600',
								)}
							>
								<div className="font-medium">PENDING</div>
								<div>Waiting: {current.roleName}</div>
							</div>
						</div>
					)}

					{inProgress &&
						upcoming.map(step => (
							<div
								key={step.id}
								className="flex items-center justify-between rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-400"
							>
								<div className="flex items-center gap-3">
									<CircleIcon className="h-5 w-5 text-slate-300" />
									<div>
										<span className="font-medium text-slate-500">
											{step.name}
										</span>
										<span className="ml-2">({step.action})</span>
									</div>
								</div>
								<div className="text-right text-xs">
									<div className="font-medium">UPCOMING</div>
									<div>{step.roleName}</div>
								</div>
							</div>
						))}
				</CardContent>
			</Card>
		</div>
	)
}
