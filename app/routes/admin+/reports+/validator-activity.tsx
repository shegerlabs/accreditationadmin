import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData, useOutletContext } from '@remix-run/react'
import { Activity, ArrowLeft, Clock, Info, Users } from 'lucide-react'
import { ExportDropdown } from '~/components/reports/export-dropdown'
import { KpiCards } from '~/components/reports/kpi-cards'
import { ReportFilters } from '~/components/reports/report-filters'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/components/ui/table'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { getValidatorActivityData } from '~/utils/reports.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	const url = new URL(request.url)
	const eventId = url.searchParams.get('eventId') ?? undefined
	const userId = url.searchParams.get('userId') ?? undefined
	const startDate = url.searchParams.get('startDate')
		? new Date(url.searchParams.get('startDate')!)
		: undefined
	const endDate = url.searchParams.get('endDate')
		? new Date(url.searchParams.get('endDate')!)
		: undefined

	const data = await getValidatorActivityData(tenantFilter, {
		eventId,
		userId,
		startDate,
		endDate,
	})

	return json({ data })
}

type ContextType = {
	events: Array<{ id: string; name: string }>
	users: Array<{ id: string; name: string | null; username: string }>
}

export default function ValidatorActivityReport() {
	const { data } = useLoaderData<typeof loader>()
	const { events, users } = useOutletContext<ContextType>()

	const kpiData = [
		{
			title: 'Active Validators',
			value: data.summary.totalValidators.toString(),
			icon: Users,
		},
		{
			title: 'Total Actions',
			value: data.summary.totalActions.toLocaleString(),
			icon: Activity,
		},
		{
			title: 'Avg Actions/Validator',
			value:
				data.summary.totalValidators > 0
					? Math.round(
							data.summary.totalActions / data.summary.totalValidators,
						).toString()
					: '0',
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
							Validator Activity Report
						</AlertTitle>
						<AlertDescription>
							Actions per validator and workload distribution. Use this report
							to balance workloads, monitor validator productivity, and track
							approval/rejection patterns.
						</AlertDescription>
					</div>
					<div className="flex items-center gap-2">
						<Button asChild variant="outline" size="sm">
							<Link to="/admin/reports">
								<ArrowLeft className="mr-2 h-4 w-4" />
								Back
							</Link>
						</Button>
						<ExportDropdown reportType="validator-activity" />
					</div>
				</div>
			</Alert>

			<Card>
				<CardHeader>
					<CardTitle>Filters</CardTitle>
				</CardHeader>
				<CardContent>
					<ReportFilters
						action="/admin/reports/validator-activity"
						fields={[
							{
								name: 'eventId',
								label: 'Event',
								type: 'select',
								options: events.map(e => ({ value: e.id, label: e.name })),
							},
							{
								name: 'userId',
								label: 'Validator',
								type: 'select',
								options: users.map(u => ({
									value: u.id,
									label: u.name ?? u.username,
								})),
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

			<Card>
				<CardHeader>
					<CardTitle>Validator Workload Distribution</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Validator</TableHead>
								<TableHead className="text-right">Total Actions</TableHead>
								<TableHead className="text-right">APPROVE</TableHead>
								<TableHead className="text-right">REJECT</TableHead>
								<TableHead className="text-right">PRINT</TableHead>
								<TableHead className="text-right">COLLECT</TableHead>
								<TableHead className="text-right">BYPASS</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.validatorActivity.map((validator, index) => (
								<TableRow key={index}>
									<TableCell className="font-medium">{validator.name}</TableCell>
									<TableCell className="text-right">{validator.total}</TableCell>
									<TableCell className="text-right">
										{validator.actions['APPROVE'] ?? 0}
									</TableCell>
									<TableCell className="text-right">
										{validator.actions['REJECT'] ?? 0}
									</TableCell>
									<TableCell className="text-right">
										{validator.actions['PRINT'] ?? 0}
									</TableCell>
									<TableCell className="text-right">
										{validator.actions['COLLECT'] ?? 0}
									</TableCell>
									<TableCell className="text-right">
										{validator.actions['BYPASS'] ?? 0}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	)
}
