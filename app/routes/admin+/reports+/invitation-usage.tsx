import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData, useOutletContext } from '@remix-run/react'
import { ArrowLeft, Info, Mail, Percent, TrendingUp } from 'lucide-react'
import { ExportDropdown } from '~/components/reports/export-dropdown'
import { KpiCards } from '~/components/reports/kpi-cards'
import { ReportFilters } from '~/components/reports/report-filters'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Badge } from '~/components/ui/badge'
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
import { getInvitationUsageData } from '~/utils/reports.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	const url = new URL(request.url)
	const eventIdParam = url.searchParams.get('eventId')

	// Filter out "all" values
	const eventId = eventIdParam && eventIdParam !== 'all' ? eventIdParam : undefined

	const data = await getInvitationUsageData(tenantFilter, { eventId })

	return json({ data })
}

type ContextType = {
	events: Array<{ id: string; name: string }>
}

export default function InvitationUsageReport() {
	const { data } = useLoaderData<typeof loader>()
	const { events } = useOutletContext<ContextType>()

	const kpiData = [
		{
			title: 'Total Invitations',
			value: data.summary.totalInvitations.toString(),
			icon: Mail,
		},
		{
			title: 'Quota Used',
			value: data.summary.hasUnlimitedQuotas
				? `${data.summary.totalUsed.toLocaleString()} used`
				: `${data.summary.totalUsed.toLocaleString()} / ${data.summary.totalQuota.toLocaleString()}`,
			icon: TrendingUp,
		},
		{
			title: 'Usage Rate',
			value: data.summary.hasUnlimitedQuotas
				? 'N/A'
				: `${data.summary.overallUsagePercentage}%`,
			icon: Percent,
		},
	]

	return (
		<div className="space-y-6">
			<Alert variant="muted">
				<Info className="h-4 w-4" />
				<div className="flex items-start justify-between">
					<div>
						<AlertTitle className="text-lg">Invitation Usage Report</AlertTitle>
						<AlertDescription>
							Quota usage by invitation and participant type. Use this report to
							manage invitation allocations, track usage rates, and follow up
							with organizations that haven't used their quotas.
						</AlertDescription>
					</div>
					<div className="flex items-center gap-2">
						<Button asChild variant="outline" size="sm">
							<Link to="/admin/reports">
								<ArrowLeft className="mr-2 h-4 w-4" />
								Back
							</Link>
						</Button>
						<ExportDropdown reportType="invitation-usage" />
					</div>
				</div>
			</Alert>

			<Card>
				<CardHeader>
					<CardTitle>Filters</CardTitle>
				</CardHeader>
				<CardContent>
					<ReportFilters
						action="/admin/reports/invitation-usage"
						fields={[
							{
								name: 'eventId',
								label: 'Event',
								type: 'select',
								options: events.map(e => ({ value: e.id, label: e.name })),
							},
						]}
					/>
				</CardContent>
			</Card>

			<KpiCards cards={kpiData} />

			<Card>
				<CardHeader>
					<CardTitle>Invitation Details</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Organization</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Access</TableHead>
								<TableHead className="text-right">Quota</TableHead>
								<TableHead className="text-right">Used</TableHead>
								<TableHead className="text-right">Remaining</TableHead>
								<TableHead>Usage</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.invitations.map((inv, index) => {
								const isUnlimited = !inv.quota || inv.quota === 0
								// Only show organization on first row of each invitation group
								const prevInv = index > 0 ? data.invitations[index - 1] : null
								const showOrganization = !prevInv || prevInv.invitationId !== inv.invitationId
								return (
									<TableRow key={inv.id}>
										<TableCell className="font-medium">
											{showOrganization ? inv.organization : ''}
										</TableCell>
										<TableCell>{inv.participantType}</TableCell>
										<TableCell>
											<Badge
												variant={inv.accessLevel === 'CLOSED' ? 'default' : 'secondary'}
											>
												{inv.accessLevel}
											</Badge>
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
													<Progress
														value={inv.usagePercentage}
														className="w-16"
													/>
													<span className="text-sm text-muted-foreground">
														{inv.usagePercentage}%
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

		</div>
	)
}
