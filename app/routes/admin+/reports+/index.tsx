import { Link } from '@remix-run/react'
import {
	BarChart3,
	Calendar,
	CheckCircle2,
	Mail,
	Settings2,
	Users,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

const reportTypes = [
	{
		id: 'custom',
		title: 'Custom Reports',
		description:
			'Build ad-hoc reports from any data model with custom fields, filters, and grouping.',
		icon: Settings2,
		metrics: ['Any data source', 'Custom filters', 'Grouping', 'Export'],
	},
	{
		id: 'participant-summary',
		title: 'Participant Summary',
		description:
			'Overview of participants by status, type, country, and registration trends.',
		icon: Users,
		metrics: ['Total by status', 'Distribution by type', 'Country breakdown', 'Trends'],
	},
	{
		id: 'workflow-performance',
		title: 'Workflow Performance',
		description:
			'Processing times, SLA compliance, approval/rejection rates, and bottlenecks.',
		icon: BarChart3,
		metrics: ['Processing time', 'SLA compliance', 'Approval rates', 'Bottlenecks'],
	},
	{
		id: 'event-overview',
		title: 'Event Overview',
		description:
			'Registration counts vs capacity, daily trends, and workflow stage distribution.',
		icon: Calendar,
		metrics: ['Registration vs quota', 'Daily trends', 'Type breakdown', 'Stage distribution'],
	},
	{
		id: 'validator-activity',
		title: 'Validator Activity',
		description:
			'Actions per validator, processing times, workload distribution, and timeline.',
		icon: CheckCircle2,
		metrics: ['Actions count', 'Processing time', 'Workload', 'Activity log'],
	},
	{
		id: 'invitation-usage',
		title: 'Invitation Usage',
		description:
			'Quota usage by invitation, participant type, access level, and organizations.',
		icon: Mail,
		metrics: ['Quota usage', 'By type', 'By access level', 'Unused quotas'],
	},
]

export default function ReportsIndexRoute() {
	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-2xl font-bold">Reports</h1>
				<p className="text-muted-foreground">
					Generate, preview, and export reports in PDF, Excel, or CSV format.
				</p>
			</div>

			{/* Reports */}
			<div>
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{reportTypes.map(report => (
						<Link key={report.id} to={report.id} className="group">
							<Card className="h-full transition-colors hover:border-primary">
								<CardHeader>
									<div className="flex items-center gap-3">
										<div className="rounded-lg bg-primary/10 p-2 group-hover:bg-primary/20">
											<report.icon className="h-5 w-5 text-primary" />
										</div>
										<CardTitle className="text-lg">{report.title}</CardTitle>
									</div>
									<CardDescription className="mt-2">
										{report.description}
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="flex flex-wrap gap-2">
										{report.metrics.map(metric => (
											<span
												key={metric}
												className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
											>
												{metric}
											</span>
										))}
									</div>
								</CardContent>
							</Card>
						</Link>
					))}
				</div>
			</div>
		</div>
	)
}
