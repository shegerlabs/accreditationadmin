import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData, useOutletContext } from '@remix-run/react'
import {
	ArrowLeft,
	CheckCircle2,
	Clock,
	Info,
	TrendingUp,
} from 'lucide-react'
import { ExportDropdown } from '~/components/reports/export-dropdown'
import { KpiCards } from '~/components/reports/kpi-cards'
import { ReportFilters } from '~/components/reports/report-filters'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { getWorkflowPerformanceData } from '~/utils/reports.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	const url = new URL(request.url)
	const eventIdParam = url.searchParams.get('eventId')
	const startDate = url.searchParams.get('startDate')
		? new Date(url.searchParams.get('startDate')!)
		: undefined
	const endDate = url.searchParams.get('endDate')
		? new Date(url.searchParams.get('endDate')!)
		: undefined

	// Filter out "all" values
	const eventId = eventIdParam && eventIdParam !== 'all' ? eventIdParam : undefined

	const data = await getWorkflowPerformanceData(tenantFilter, {
		eventId,
		startDate,
		endDate,
	})

	return json({ data })
}

type ContextType = {
	events: Array<{ id: string; name: string }>
}

export default function WorkflowPerformanceReport() {
	const { data } = useLoaderData<typeof loader>()
	const { events } = useOutletContext<ContextType>()

	const kpiData = [
		{
			title: 'Total Actions',
			value: data.summary.totalActions.toLocaleString(),
			icon: TrendingUp,
		},
		{
			title: 'Approval Rate',
			value: `${data.summary.overallApprovalRate}%`,
			icon: CheckCircle2,
		},
		{
			title: 'Steps with SLA',
			value: data.summary.stepsWithSla.toString(),
			icon: Clock,
		},
	]

	return (
		<div className="space-y-6">
			<Alert variant="muted">
				<Info className="h-4 w-4" />
				<div className="flex items-start justify-between">
					<div>
						<AlertTitle className="text-lg">
							Workflow Performance Report
						</AlertTitle>
						<AlertDescription>
							Processing times, approval rates, and bottleneck analysis. Use
							this report to identify bottlenecks, optimize validator workloads,
							and improve overall accreditation processing speed.
						</AlertDescription>
					</div>
					<div className="flex items-center gap-2">
						<Button asChild variant="outline" size="sm">
							<Link to="/admin/reports">
								<ArrowLeft className="mr-2 h-4 w-4" />
								Back
							</Link>
						</Button>
						<ExportDropdown reportType="workflow-performance" />
					</div>
				</div>
			</Alert>

			<Card>
				<CardHeader>
					<CardTitle>Filters</CardTitle>
				</CardHeader>
				<CardContent>
					<ReportFilters
						action="/admin/reports/workflow-performance"
						fields={[
							{
								name: 'eventId',
								label: 'Event',
								type: 'select',
								options: events.map(e => ({ value: e.id, label: e.name })),
							},
							{
								name: 'startDate',
								label: 'Start Date',
								type: 'date',
							},
							{
								name: 'endDate',
								label: 'End Date',
								type: 'date',
							},
						]}
					/>
				</CardContent>
			</Card>

			<KpiCards cards={kpiData} />
		</div>
	)
}
