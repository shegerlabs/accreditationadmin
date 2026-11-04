import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData, useOutletContext } from '@remix-run/react'
import { ArrowLeft, Calendar, Info, Percent, TrendingUp, Users } from 'lucide-react'
import {
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts'
import { ExportDropdown } from '~/components/reports/export-dropdown'
import { KpiCards } from '~/components/reports/kpi-cards'
import { ReportFilters } from '~/components/reports/report-filters'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Progress } from '~/components/ui/progress'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/components/ui/table'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { getEventOverviewData } from '~/utils/reports.server'

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

	const data = await getEventOverviewData(tenantFilter, {
		eventId,
		startDate,
		endDate,
	})

	return json({ data })
}

type ContextType = {
	events: Array<{ id: string; name: string }>
}

export default function EventOverviewReport() {
	const { data } = useLoaderData<typeof loader>()
	const { events } = useOutletContext<ContextType>()

	const hasData = data.event && data.summary

	const kpiData = hasData
		? [
				{
					title: 'Registrations',
					value: data.summary!.registrationCount.toLocaleString(),
					icon: Users,
				},
				{
					title: 'Quota Capacity',
					value: data.summary!.quotaCapacity.toLocaleString(),
					icon: TrendingUp,
				},
				{
					title: 'Usage',
					value: `${data.summary!.usagePercentage}%`,
					icon: Percent,
				},
				{
					title: 'Event Status',
					value: data.event!.status,
					icon: Calendar,
				},
			]
		: []

	return (
		<div className="space-y-6">
			<Alert variant="muted">
				<Info className="h-4 w-4" />
				<div className="flex items-start justify-between">
					<div>
						<AlertTitle className="text-lg">Event Overview Report</AlertTitle>
						<AlertDescription>
							Registration counts, trends, and quota usage. Use this report to
							monitor event capacity, track daily registration trends, and view
							participant type breakdown.
						</AlertDescription>
					</div>
					<div className="flex items-center gap-2">
						<Button asChild variant="outline" size="sm">
							<Link to="/admin/reports">
								<ArrowLeft className="mr-2 h-4 w-4" />
								Back
							</Link>
						</Button>
						<ExportDropdown reportType="event-overview" disabled={!hasData} />
					</div>
				</div>
			</Alert>

			<Card>
				<CardHeader>
					<CardTitle>Filters</CardTitle>
				</CardHeader>
				<CardContent>
					<ReportFilters
						action="/admin/reports/event-overview"
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

			{!hasData ? (
				<Card>
					<CardContent className="py-12 text-center">
						<p className="text-muted-foreground">
							Please select an event to view the overview report.
						</p>
					</CardContent>
				</Card>
			) : (
				<>
					<KpiCards cards={kpiData} />

					<div className="grid gap-4 md:grid-cols-2">
						<Card>
							<CardHeader>
								<CardTitle>Registration vs Quota</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-4">
									<div className="flex items-center justify-between text-sm">
										<span>
											{data.summary!.registrationCount.toLocaleString()} /{' '}
											{data.summary!.quotaCapacity.toLocaleString()}
										</span>
										<span className="text-muted-foreground">
											{data.summary!.usagePercentage}%
										</span>
									</div>
									<Progress value={data.summary!.usagePercentage} />
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Event Details</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-2 text-sm">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Name:</span>
										<span className="font-medium">{data.event!.name}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Status:</span>
										<span className="font-medium">{data.event!.status}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Start Date:</span>
										<span className="font-medium">{data.event!.startDate}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">End Date:</span>
										<span className="font-medium">{data.event!.endDate}</span>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					<Card>
						<CardHeader>
							<CardTitle>Daily Registration Trends</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="h-[300px]">
								<ResponsiveContainer width="100%" height="100%">
									<LineChart data={data.trends}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="date" />
										<YAxis allowDecimals={false} />
										<Tooltip />
										<Line
											type="monotone"
											dataKey="count"
											name="Registrations"
											stroke="hsl(var(--chart-1))"
											strokeWidth={2}
										/>
									</LineChart>
								</ResponsiveContainer>
							</div>
						</CardContent>
					</Card>

					<div className="grid gap-4 md:grid-cols-2">
						<Card>
							<CardHeader>
								<CardTitle>By Participant Type</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="h-[300px]">
									<ResponsiveContainer width="100%" height="100%">
										<BarChart
											data={data.typeBreakdown}
											margin={{ top: 20, right: 30, left: 20, bottom: 50 }}
										>
											<CartesianGrid strokeDasharray="3 3" />
											<XAxis
												dataKey="name"
												angle={-45}
												textAnchor="end"
												height={70}
												interval={0}
											/>
											<YAxis allowDecimals={false} />
											<Tooltip />
											<Bar
												dataKey="count"
												name="Participants"
												fill="hsl(var(--chart-2))"
											/>
										</BarChart>
									</ResponsiveContainer>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>By Workflow Stage</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="h-[300px]">
									<ResponsiveContainer width="100%" height="100%">
										<BarChart
											data={data.stageDistribution}
											margin={{ top: 20, right: 30, left: 20, bottom: 50 }}
										>
											<CartesianGrid strokeDasharray="3 3" />
											<XAxis
												dataKey="stepName"
												angle={-45}
												textAnchor="end"
												height={70}
												interval={0}
											/>
											<YAxis allowDecimals={false} />
											<Tooltip />
											<Bar
												dataKey="count"
												name="Participants"
												fill="hsl(var(--chart-3))"
											/>
										</BarChart>
									</ResponsiveContainer>
								</div>
							</CardContent>
						</Card>
					</div>

					<Card>
						<CardHeader>
							<CardTitle>Invitation Usage Summary</CardTitle>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Organization</TableHead>
										<TableHead className="text-right">Quota</TableHead>
										<TableHead className="text-right">Used</TableHead>
										<TableHead className="text-right">Remaining</TableHead>
										<TableHead>Usage</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{data.invitationUsage.map((inv, index) => {
										const isUnlimited = !inv.quota || inv.quota === 0
										const usagePercent =
											inv.quota && inv.quota > 0
												? Math.round((inv.used / inv.quota) * 100)
												: 0
										return (
											<TableRow key={index}>
												<TableCell className="font-medium">
													{inv.organization}
												</TableCell>
												<TableCell className="text-right">
													{isUnlimited ? 'Unlimited' : inv.quota}
												</TableCell>
												<TableCell className="text-right">{inv.used}</TableCell>
												<TableCell className="text-right">
													{isUnlimited ? '-' : inv.remaining}
												</TableCell>
												<TableCell>
													{isUnlimited ? (
														<span className="text-sm text-muted-foreground">-</span>
													) : (
														<div className="flex items-center gap-2">
															<Progress value={usagePercent} className="w-20" />
															<span className="text-sm text-muted-foreground">
																{usagePercent}%
															</span>
														</div>
													)}
												</TableCell>
											</TableRow>
										)
									})}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</>
			)}
		</div>
	)
}
