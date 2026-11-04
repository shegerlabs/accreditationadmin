import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { AlertCircle, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import {
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { calculateSlaStatus, type SlaInfo } from '~/utils/sla'

interface ParticipantWithSla {
	stepName: string
	slaInfo: SlaInfo
}

interface StepSlaBreakdown {
	stepName: string
	onTime: number
	warning: number
	overdue: number
	noSla: number
}

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	// Get all active participants (not COLLECTED or ARCHIVED, excluding soft-deleted) with their step info
	const participants = await prisma.participant.findMany({
		where: {
			...tenantFilter,
			deletedAt: null,
			status: {
				notIn: ['COLLECTED', 'ARCHIVED'],
			},
		},
		select: {
			createdAt: true,
			step: {
				select: {
					name: true,
					slaDurationMinutes: true,
				},
			},
			approvals: {
				orderBy: { createdAt: 'desc' },
				take: 1,
				select: {
					createdAt: true,
				},
			},
		},
	})

	// Get SLA warning threshold from settings
	const slaWarningThreshold = await getSetting<number>(SettingKeys.SLA_WARNING_THRESHOLD_PERCENT)

	// Calculate SLA status for each participant
	const participantsWithSla: ParticipantWithSla[] = participants.map(p => {
		const stepEnteredAt = p.approvals[0]?.createdAt
			? new Date(p.approvals[0].createdAt)
			: new Date(p.createdAt)

		const slaInfo = calculateSlaStatus(
			stepEnteredAt,
			p.step?.slaDurationMinutes ?? null,
			slaWarningThreshold,
		)

		return {
			stepName: p.step?.name ?? 'Unknown',
			slaInfo,
		}
	})

	// Calculate summary counts
	const summary = {
		total: participantsWithSla.length,
		overdue: participantsWithSla.filter(p => p.slaInfo.status === 'overdue').length,
		warning: participantsWithSla.filter(p => p.slaInfo.status === 'warning').length,
		onTime: participantsWithSla.filter(p => p.slaInfo.status === 'on_time').length,
		noSla: participantsWithSla.filter(p => p.slaInfo.status === 'no_sla').length,
	}

	// Group by step for the chart
	const stepBreakdown = new Map<string, StepSlaBreakdown>()

	for (const p of participantsWithSla) {
		const existing = stepBreakdown.get(p.stepName) || {
			stepName: p.stepName,
			onTime: 0,
			warning: 0,
			overdue: 0,
			noSla: 0,
		}

		switch (p.slaInfo.status) {
			case 'on_time':
				existing.onTime++
				break
			case 'warning':
				existing.warning++
				break
			case 'overdue':
				existing.overdue++
				break
			case 'no_sla':
				existing.noSla++
				break
		}

		stepBreakdown.set(p.stepName, existing)
	}

	const EXCLUDED_STEPS = ['Request Received', 'Review Request']
	const chartData = Array.from(stepBreakdown.values())
		.filter(s => !EXCLUDED_STEPS.includes(s.stepName))
		.sort(
			(a, b) => (b.overdue + b.warning) - (a.overdue + a.warning),
		)

	return json({
		summary,
		chartData,
	})
}

export default function MonitorRoute() {
	const { summary, chartData } = useLoaderData<typeof loader>()

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Monitor</h1>
				<p className="text-muted-foreground">
					Monitor SLA compliance and identify participants stuck at workflow steps
				</p>
			</div>

			{/* Summary Cards */}
			<div className="grid gap-4 md:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Active</CardTitle>
						<Clock className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{summary.total}</div>
						<p className="text-xs text-muted-foreground">
							Participants in workflow
						</p>
					</CardContent>
				</Card>

				<Card className="border-red-200 bg-red-50">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-red-800">Overdue</CardTitle>
						<AlertCircle className="h-4 w-4 text-red-600" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-red-800">{summary.overdue}</div>
						<p className="text-xs text-red-600">
							Exceeded SLA limit
						</p>
					</CardContent>
				</Card>

				<Card className="border-amber-200 bg-amber-50">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-amber-800">Warning</CardTitle>
						<AlertTriangle className="h-4 w-4 text-amber-600" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-amber-800">{summary.warning}</div>
						<p className="text-xs text-amber-600">
							Approaching SLA limit
						</p>
					</CardContent>
				</Card>

				<Card className="border-green-200 bg-green-50">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-green-800">On Time</CardTitle>
						<CheckCircle className="h-4 w-4 text-green-600" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-green-800">{summary.onTime}</div>
						<p className="text-xs text-green-600">
							Within SLA limits
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Stacked Bar Chart */}
			<Card>
				<CardHeader>
					<CardTitle>SLA Status by Step</CardTitle>
					<CardDescription>
						Distribution of SLA statuses across workflow steps
					</CardDescription>
				</CardHeader>
				<CardContent>
					{chartData.length > 0 ? (
						<div className="h-[400px]">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart
									data={chartData}
									margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
								>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis
										dataKey="stepName"
										interval={0}
										tick={{ fontSize: 12 }}
										tickFormatter={(value: string) =>
											value.length > 15 ? `${value.slice(0, 15)}...` : value
										}
									/>
									<YAxis allowDecimals={false} />
									<Tooltip />
									<Legend />
									<Bar dataKey="overdue" name="Overdue" stackId="a" fill="#dc2626" />
									<Bar dataKey="warning" name="Warning" stackId="a" fill="#d97706" />
									<Bar dataKey="onTime" name="On Time" stackId="a" fill="#16a34a" />
									<Bar dataKey="noSla" name="No SLA" stackId="a" fill="#9ca3af" />
								</BarChart>
							</ResponsiveContainer>
						</div>
					) : (
						<div className="flex h-[200px] items-center justify-center text-muted-foreground">
							No active participants in workflow
						</div>
					)}
				</CardContent>
			</Card>

		</div>
	)
}
