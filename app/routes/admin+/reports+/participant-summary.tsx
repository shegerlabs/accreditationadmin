import type { RequestStatus } from '@prisma/client'
import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData, useOutletContext } from '@remix-run/react'
import { ArrowLeft, Globe, Info, TrendingUp, Users } from 'lucide-react'
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Pie,
	PieChart,
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
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { getParticipantSummaryData } from '~/utils/reports.server'

const STATUS_COLORS: Record<string, string> = {
	PRINTED: 'hsl(var(--chart-1))',
	INPROGRESS: 'hsl(var(--chart-2))',
	REJECTED: 'hsl(var(--chart-3))',
	COLLECTED: 'hsl(var(--chart-4))',
	ARCHIVED: 'hsl(var(--chart-5))',
	PENDING: 'hsl(200, 70%, 50%)',
	APPROVED: 'hsl(120, 70%, 50%)',
	CANCELLED: 'hsl(0, 0%, 50%)',
	NOTIFIED: 'hsl(280, 70%, 50%)',
	BYPASSED: 'hsl(40, 70%, 50%)',
}

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	const url = new URL(request.url)
	const eventId = url.searchParams.get('eventId') ?? undefined
	const participantTypeId = url.searchParams.get('participantTypeId') ?? undefined
	const countryId = url.searchParams.get('countryId') ?? undefined
	const status = url.searchParams.get('status') as RequestStatus | undefined
	const startDate = url.searchParams.get('startDate')
		? new Date(url.searchParams.get('startDate')!)
		: undefined
	const endDate = url.searchParams.get('endDate')
		? new Date(url.searchParams.get('endDate')!)
		: undefined

	const data = await getParticipantSummaryData(tenantFilter, {
		eventId,
		participantTypeId,
		countryId,
		status: status && status !== ('all' as never) ? status : undefined,
		startDate,
		endDate,
	})

	return json({ data })
}

type ContextType = {
	events: Array<{ id: string; name: string }>
	participantTypes: Array<{ id: string; name: string }>
	countries: Array<{ id: string; name: string }>
}

export default function ParticipantSummaryReport() {
	const { data } = useLoaderData<typeof loader>()
	const { events, participantTypes, countries } =
		useOutletContext<ContextType>()

	// Status values defined here to avoid importing Prisma enum on client
	const REQUEST_STATUSES = [
		'PENDING',
		'INPROGRESS',
		'APPROVED',
		'REJECTED',
		'PRINTED',
		'COLLECTED',
		'ARCHIVED',
		'CANCELLED',
		'NOTIFIED',
		'BYPASSED',
	] as const

	const statusOptions = REQUEST_STATUSES.map(status => ({
		value: status,
		label: status.charAt(0) + status.slice(1).toLowerCase(),
	}))

	const kpiData = [
		{
			title: 'Total Participants',
			value: data.summary.total.toLocaleString(),
			icon: Users,
		},
		{
			title: 'Printed',
			value: data.summary.printed.toLocaleString(),
			icon: TrendingUp,
		},
		{
			title: 'Collected',
			value: data.summary.collected.toLocaleString(),
			icon: TrendingUp,
		},
		{
			title: 'Completion Rate',
			value: `${data.summary.completionRate}%`,
			icon: TrendingUp,
		},
	]

	return (
		<div className="space-y-6">
			<Alert variant="muted">
				<Info className="h-4 w-4" />
				<div className="flex items-start justify-between">
					<div>
						<AlertTitle className="text-lg">
							Participant Summary Report
						</AlertTitle>
						<AlertDescription>
							Overview of participants by status, type, and country. Use this
							report to monitor registration progress, identify trends, and
							analyze participant demographics.
						</AlertDescription>
					</div>
					<div className="flex items-center gap-2">
						<Button asChild variant="outline" size="sm">
							<Link to="/admin/reports">
								<ArrowLeft className="mr-2 h-4 w-4" />
								Back
							</Link>
						</Button>
						<ExportDropdown reportType="participant-summary" />
					</div>
				</div>
			</Alert>

			<Card>
				<CardHeader>
					<CardTitle>Filters</CardTitle>
				</CardHeader>
				<CardContent>
					<ReportFilters
						action="/admin/reports/participant-summary"
						fields={[
							{
								name: 'eventId',
								label: 'Event',
								type: 'select',
								options: events.map(e => ({ value: e.id, label: e.name })),
							},
							{
								name: 'participantTypeId',
								label: 'Participant Type',
								type: 'select',
								options: participantTypes.map(pt => ({
									value: pt.id,
									label: pt.name,
								})),
							},
							{
								name: 'countryId',
								label: 'Country',
								type: 'select',
								options: countries.map(c => ({ value: c.id, label: c.name })),
							},
							{
								name: 'status',
								label: 'Status',
								type: 'select',
								options: statusOptions,
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

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Status Distribution</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-[300px]">
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie
										data={data.summary.byStatus.map(s => ({
											name: s.status,
											value: s.count,
										}))}
										cx="50%"
										cy="50%"
										outerRadius={80}
										dataKey="value"
										label={({ name, percent }) =>
											`${name} (${(percent * 100).toFixed(0)}%)`
										}
									>
										{data.summary.byStatus.map((entry, index) => (
											<Cell
												key={`cell-${index}`}
												fill={STATUS_COLORS[entry.status] ?? '#999'}
											/>
										))}
									</Pie>
									<Tooltip />
								</PieChart>
							</ResponsiveContainer>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>By Participant Type</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-[300px]">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart
									data={data.summary.byType}
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
										fill="hsl(var(--chart-1))"
									/>
								</BarChart>
							</ResponsiveContainer>
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Top Countries</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="h-[300px]">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={data.summary.byCountry.slice(0, 10)}
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

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Top Organizations</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-[300px]">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart
									data={data.summary.byOrganization.slice(0, 10)}
									layout="vertical"
									margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
								>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis type="number" allowDecimals={false} />
									<YAxis
										type="category"
										dataKey="name"
										width={90}
										tick={{ fontSize: 11 }}
									/>
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

				<Card>
					<CardHeader>
						<CardTitle>By Event</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-[300px]">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart
									data={data.summary.byEvent}
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
										fill="hsl(var(--chart-4))"
									/>
								</BarChart>
							</ResponsiveContainer>
						</div>
					</CardContent>
				</Card>
			</div>

		</div>
	)
}
