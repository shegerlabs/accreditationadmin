import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import {
	differenceInDays,
	endOfMonth,
	format,
	startOfMonth,
	subDays,
	subMonths,
} from 'date-fns'
import {
	Area,
	AreaChart,
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
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	// Get date ranges
	const thirtyDaysAgo = subDays(new Date(), 30)
	const startOfCurrentMonth = startOfMonth(new Date())
	const endOfCurrentMonth = endOfMonth(new Date())
	const sixMonthsAgo = subMonths(new Date(), 6)

	// Daily activity over time
	const dailyActivity = await prisma.$queryRaw<
		{ date: string; count: bigint }[]
	>`
    SELECT 
      DATE("createdAt") as date,
      COUNT(*)::bigint as count
    FROM "AuditLog"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `

	// Action type distribution
	const actionDistribution = await prisma.$queryRaw<
		{ action: string; count: bigint }[]
	>`
    SELECT 
      action,
      COUNT(*)::bigint as count
    FROM "AuditLog"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY action
    ORDER BY count DESC
  `

	// Entity type distribution
	const entityDistribution = await prisma.$queryRaw<
		{ entityType: string; count: bigint }[]
	>`
    SELECT 
      "entityType",
      COUNT(*)::bigint as count
    FROM "AuditLog"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY "entityType"
    ORDER BY count DESC
  `

	// Top users by activity
	const topUsers = await prisma.$queryRaw<
		{ username: string; count: bigint }[]
	>`
    SELECT 
      u.username,
      COUNT(*)::bigint as count
    FROM "AuditLog" a
    LEFT JOIN "User" u ON a."userId" = u.id
    WHERE a."createdAt" >= ${thirtyDaysAgo}
      AND u.username IS NOT NULL
    GROUP BY u.username
    ORDER BY count DESC
    LIMIT 10
  `

	// Activity by hour of day
	const activityByHour = await prisma.$queryRaw<
		{ hour: number; count: bigint }[]
	>`
    SELECT 
      EXTRACT(HOUR FROM "createdAt") as hour,
      COUNT(*)::bigint as count
    FROM "AuditLog"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY EXTRACT(HOUR FROM "createdAt")
    ORDER BY hour
  `

	const recentActivity = await prisma.auditLog.findMany({
		take: 5,
		orderBy: {
			createdAt: 'desc',
		},
		include: {
			user: {
				select: {
					username: true,
				},
			},
		},
	})

	// Participant statistics
	const participantTypes = await prisma.participant.groupBy({
		by: ['participantTypeId'],
		_count: true,
		where: {
			participantTypeId: {
				not: '',
			},
		},
		orderBy: {
			participantTypeId: 'desc',
		},
	})

	// Get status counts for each participant type
	const participantTypeStatusCounts = await prisma.participant.groupBy({
		by: ['participantTypeId', 'status'],
		_count: true,
		where: {
			participantTypeId: {
				not: '',
			},
			status: {
				in: ['PRINTED', 'INPROGRESS', 'REJECTED'],
			},
		},
	})

	const typesWithNames = await Promise.all(
		participantTypes.map(async type => {
			const participantType = await prisma.participantType.findUnique({
				where: { id: type.participantTypeId },
			})

			// Get status counts for this type
			const statusCounts = {
				printed: 0,
				inProgress: 0,
				rejected: 0,
			}

			participantTypeStatusCounts
				.filter(stat => stat.participantTypeId === type.participantTypeId)
				.forEach(stat => {
					switch (stat.status) {
						case 'PRINTED':
							statusCounts.printed = Number(stat._count)
							break
						case 'INPROGRESS':
							statusCounts.inProgress = Number(stat._count)
							break
						case 'REJECTED':
							statusCounts.rejected = Number(stat._count)
							break
					}
				})

			return {
				name: participantType?.name ?? 'Unknown',
				total: type._count,
				...statusCounts,
			}
		}),
	)

	const participantsByCountry = await prisma.participant.groupBy({
		by: ['countryId'],
		_count: true,
		where: {
			countryId: {
				not: '',
			},
		},
		orderBy: {
			countryId: 'desc',
		},
	})

	const countryCounts = await Promise.all(
		participantsByCountry.map(async entry => {
			const country = await prisma.country.findUnique({
				where: { id: entry.countryId },
			})
			return {
				name: country?.name ?? 'Unknown',
				value: entry._count,
			}
		}),
	)

	// Event statistics
	const eventStats = await prisma.event.groupBy({
		by: ['status'],
		_count: true,
	})

	// Registration trends
	const registrationTrend = await prisma.$queryRaw<
		{ date: string; count: bigint }[]
	>`
    SELECT 
      DATE("createdAt") as date,
      COUNT(*)::bigint as count
    FROM "Participant"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `

	// Event performance metrics
	const eventPerformance = await prisma.event.findMany({
		select: {
			id: true,
			name: true,
			status: true,
			startDate: true,
			endDate: true,
			_count: {
				select: {
					participants: true,
				},
			},
			participants: {
				select: {
					status: true,
				},
			},
		},
		where: {
			startDate: {
				gte: sixMonthsAgo,
			},
		},
		orderBy: {
			startDate: 'desc',
		},
		take: 10,
	})

	const eventPerformanceWithCounts = eventPerformance.map(event => {
		const statusCounts = {
			printed: 0,
			inProgress: 0,
			rejected: 0,
		}

		event.participants.forEach(participant => {
			switch (participant.status) {
				case 'PRINTED':
					statusCounts.printed++
					break
				case 'INPROGRESS':
					statusCounts.inProgress++
					break
				case 'REJECTED':
					statusCounts.rejected++
					break
			}
		})

		return {
			name: event.name,
			status: event.status,
			startDate: format(new Date(event.startDate), 'MMM dd, yyyy'),
			endDate: format(new Date(event.endDate), 'MMM dd, yyyy'),
			total: Number(event._count.participants),
			...statusCounts,
			duration: differenceInDays(
				new Date(event.endDate),
				new Date(event.startDate),
			),
		}
	})

	// Country participation distribution with percentage
	const totalParticipants = await prisma.$queryRaw<[{ count: bigint }]>`
		SELECT COUNT(*)::bigint as count FROM "Participant"
	`

	const countryDistribution = await prisma.$queryRaw<
		{ country_id: string; count: bigint }[]
	>`
    SELECT 
      "countryId" as country_id,
      COUNT(*)::bigint as count
    FROM "Participant"
    WHERE "countryId" IS NOT NULL
    GROUP BY "countryId"
    ORDER BY count DESC
  `

	const countryStats = await Promise.all(
		countryDistribution.map(async entry => {
			const country = await prisma.country.findUnique({
				where: { id: entry.country_id },
			})
			return {
				name: country?.name ?? 'Unknown',
				value: Number(entry.count),
				percentage: (
					(Number(entry.count) / Number(totalParticipants[0].count)) *
					100
				).toFixed(1),
			}
		}),
	)

	const types = await prisma.participantType.findMany({
		include: {
			_count: {
				select: {
					participants: true,
				},
			},
		},
		orderBy: {
			name: 'asc',
		},
	})

	const typeAnalysis = types.map(type => ({
		name: type.name,
		participantCount: type._count.participants,
	}))

	return json({
		dailyActivity: dailyActivity.map(d => ({
			date: format(new Date(d.date), 'MMM dd'),
			count: Number(d.count),
		})),
		actionDistribution: actionDistribution.map(d => ({
			name: d.action,
			value: Number(d.count),
		})),
		entityDistribution: entityDistribution.map(d => ({
			name: d.entityType,
			value: Number(d.count),
		})),
		topUsers: topUsers.map(u => ({
			name: u.username,
			value: Number(u.count),
		})),
		activityByHour: activityByHour.map(h => ({
			hour: Number(h.hour),
			count: Number(h.count),
		})),
		recentActivity: recentActivity.map(activity => ({
			...activity,
			createdAt: format(new Date(activity.createdAt), 'MMM dd, yyyy HH:mm:ss'),
		})),
		participantTypes: typesWithNames,
		participantsByCountry: countryCounts.map(c => ({
			name: c.name,
			value: Number(c.value),
		})),
		eventStats: eventStats.map(stat => ({
			name: stat.status,
			value: Number(stat._count),
		})),
		registrationTrend: registrationTrend.map(d => ({
			date: format(new Date(d.date), 'MMM dd'),
			count: Number(d.count),
		})),
		eventPerformance: eventPerformanceWithCounts,
		countryStats: countryStats.map(stat => ({
			name: stat.name,
			value: Number(stat.value),
			percentage: Number(stat.percentage),
		})),
		typeAnalysis,
	})
}

const COLORS = [
	'hsl(var(--chart-1))',
	'hsl(var(--chart-2))',
	'hsl(var(--chart-3))',
	'hsl(var(--chart-4))',
	'hsl(var(--chart-5))',
]

export default function ChartsRoute() {
	const data = useLoaderData<typeof loader>()

	return (
		<div className="space-y-8">
			{/* Event Performance Table */}
			<Card>
				<CardHeader>
					<CardTitle>Event Performance</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="relative overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead>
								<tr className="border-b">
									<th className="p-4">Event Name</th>
									<th className="p-4">Status</th>
									<th className="p-4">Start Date</th>
									<th className="p-4">Duration (days)</th>
									<th className="p-4">Total</th>
									<th className="p-4">Printed</th>
									<th className="p-4">In Progress</th>
									<th className="p-4">Rejected</th>
								</tr>
							</thead>
							<tbody>
								{data.eventPerformance.map((event, index) => (
									<tr key={index} className="border-b hover:bg-muted/50">
										<td className="p-4">{event.name}</td>
										<td className="p-4">{event.status}</td>
										<td className="p-4">{event.startDate}</td>
										<td className="p-4">{event.duration}</td>
										<td className="p-4">{event.total}</td>
										<td className="p-4">{event.printed}</td>
										<td className="p-4">{event.inProgress}</td>
										<td className="p-4">{event.rejected}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
			{/* Participants by Type */}
			<Card>
				<CardHeader>
					<CardTitle>Participants by Type</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="h-[400px]">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={data.typeAnalysis}
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
									dataKey="participantCount"
									name="Participants"
									fill="hsl(var(--chart-4))"
								/>
							</BarChart>
						</ResponsiveContainer>
					</div>
				</CardContent>
			</Card>

			{/* Participant Statistics */}
			<Card>
				<CardHeader>
					<CardTitle>Participants by Type</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="h-[400px]">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={data.participantTypes}
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
									dataKey="total"
									name="Total Participants"
									fill="hsl(var(--chart-4))"
								/>
								<Bar
									dataKey="printed"
									name="Printed"
									fill="hsl(var(--chart-1))"
								/>
								<Bar
									dataKey="inProgress"
									name="In Progress"
									fill="hsl(var(--chart-2))"
								/>
								<Bar
									dataKey="rejected"
									name="Rejected"
									fill="hsl(var(--chart-3))"
								/>
							</BarChart>
						</ResponsiveContainer>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Participants by Country</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="h-[400px]">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={data.participantsByCountry}
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
									dataKey="value"
									name="Participants"
									fill="hsl(var(--chart-5))"
								/>
							</BarChart>
						</ResponsiveContainer>
					</div>
				</CardContent>
			</Card>

			{/* Country Distribution with Percentages */}
			<Card>
				<CardHeader>
					<CardTitle>Country Distribution (Top 10)</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="h-[400px]">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={data.countryStats.slice(0, 10)}
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
								<YAxis yAxisId="left" />
								<YAxis
									yAxisId="right"
									orientation="right"
									tickFormatter={value => `${value}%`}
								/>
								<Tooltip
									formatter={(value, name) =>
										name === 'Percentage' ? `${value}%` : value
									}
								/>
								<Bar
									yAxisId="left"
									dataKey="value"
									name="Participants"
									fill="hsl(var(--chart-4))"
								/>
								<Bar
									yAxisId="right"
									dataKey="percentage"
									name="Percentage"
									fill="hsl(var(--chart-5))"
								/>
							</BarChart>
						</ResponsiveContainer>
					</div>
				</CardContent>
			</Card>

			{/* Activity Over Time */}
			<Card>
				<CardHeader>
					<CardTitle>Daily Activity (Last 30 Days)</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="h-[300px]">
						<ResponsiveContainer width="100%" height="100%">
							<AreaChart data={data.dailyActivity}>
								<defs>
									<linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
										<stop
											offset="5%"
											stopColor="hsl(var(--chart-1))"
											stopOpacity={0.8}
										/>
										<stop
											offset="95%"
											stopColor="hsl(var(--chart-1))"
											stopOpacity={0.1}
										/>
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="date" />
								<YAxis />
								<Tooltip />
								<Area
									type="monotone"
									dataKey="count"
									stroke="hsl(var(--chart-1))"
									fillOpacity={1}
									fill="url(#colorCount)"
								/>
							</AreaChart>
						</ResponsiveContainer>
					</div>
				</CardContent>
			</Card>

			{/* Activity by Hour */}
			<Card>
				<CardHeader>
					<CardTitle>Activity by Hour of Day</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="h-[300px]">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={data.activityByHour}>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="hour" tickFormatter={hour => `${hour}:00`} />
								<YAxis />
								<Tooltip labelFormatter={hour => `${hour}:00`} />
								<Bar
									dataKey="count"
									name="Actions"
									fill="hsl(var(--chart-3))"
								/>
							</BarChart>
						</ResponsiveContainer>
					</div>
				</CardContent>
			</Card>

			{/* Event Status and Registration Trend */}
			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Event Status Distribution</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-[300px]">
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie
										data={data.eventStats}
										cx="50%"
										cy="50%"
										outerRadius={80}
										fill="hsl(var(--chart-4))"
										dataKey="value"
										label
									>
										{data.eventStats.map((entry, index) => (
											<Cell
												key={`cell-${index}`}
												fill={COLORS[index % COLORS.length]}
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
						<CardTitle>Registration Trend (30 Days)</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-[300px]">
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart data={data.registrationTrend}>
									<defs>
										<linearGradient
											id="colorRegistration"
											x1="0"
											y1="0"
											x2="0"
											y2="1"
										>
											<stop
												offset="5%"
												stopColor="hsl(var(--chart-5))"
												stopOpacity={0.8}
											/>
											<stop
												offset="95%"
												stopColor="hsl(var(--chart-5))"
												stopOpacity={0.1}
											/>
										</linearGradient>
									</defs>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" />
									<YAxis />
									<Tooltip />
									<Area
										type="monotone"
										dataKey="count"
										stroke="hsl(var(--chart-5))"
										fillOpacity={1}
										fill="url(#colorRegistration)"
									/>
								</AreaChart>
							</ResponsiveContainer>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Top Users */}
			<Card>
				<CardHeader>
					<CardTitle>Top Users by Activity</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="h-[300px]">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={data.topUsers}
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
								<YAxis />
								<Tooltip />
								<Bar
									dataKey="value"
									name="Actions"
									fill="hsl(var(--chart-3))"
								/>
							</BarChart>
						</ResponsiveContainer>
					</div>
				</CardContent>
			</Card>

			{/* Recent Activity */}
			<Card>
				<CardHeader>
					<CardTitle>Recent Activity</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{data.recentActivity.map(activity => (
							<div
								key={activity.id}
								className="flex items-center justify-between border-b pb-2"
							>
								<div>
									<p className="font-medium">{activity.description}</p>
									<p className="text-sm text-muted-foreground">
										by {activity.user?.username || 'System'}
									</p>
								</div>
								<p className="text-sm text-muted-foreground">
									{activity.createdAt}
								</p>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
