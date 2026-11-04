import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Link, useFetcher, useLoaderData } from '@remix-run/react'
import { format } from 'date-fns'
import {
	ArrowLeft,
	Download,
	FileText,
	Globe,
	Lock,
	Mail,
	Pencil,
	Play,
	Shield,
	Tag,
	Trash2,
	Users,
} from 'lucide-react'
import { useState } from 'react'
import { ReportResults } from '~/components/custom-reports'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import {
	executeCustomReport,
	executeGroupedReport,
} from '~/utils/custom-report-query.server'
import type {
	CustomReportConfig,
	DataSourceType,
	ReportResult,
} from '~/utils/custom-report-types'
import { prisma } from '~/utils/db.server'
import { getDataSourceInfo, getFieldDefinition } from '~/utils/custom-report-schema'

// Icon mapping
const DATA_SOURCE_ICONS: Record<DataSourceType, React.ComponentType<{ className?: string }>> = {
	Participant: Users,
	Invitation: Mail,
	AuditLog: FileText,
	ParticipantType: Tag,
	Country: Globe,
	Restriction: Shield,
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)
	const { reportId } = params

	if (!reportId) {
		throw new Response('Report ID required', { status: 400 })
	}

	const report = await prisma.customReport.findFirst({
		where: {
			id: reportId,
			...tenantFilter,
			OR: [{ isPublic: true }, { createdById: user.id }],
		},
		include: {
			createdBy: {
				select: {
					id: true,
					name: true,
					username: true,
				},
			},
		},
	})

	if (!report) {
		throw new Response('Report not found', { status: 404 })
	}

	return json({
		report: {
			...report,
			config: report.config as unknown as CustomReportConfig,
		},
		isOwner: report.createdById === user.id,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)
	const { reportId } = params

	if (!reportId) {
		return json({ error: 'Report ID required' }, { status: 400 })
	}

	const report = await prisma.customReport.findFirst({
		where: {
			id: reportId,
			...tenantFilter,
			OR: [{ isPublic: true }, { createdById: user.id }],
		},
	})

	if (!report) {
		return json({ error: 'Report not found' }, { status: 404 })
	}

	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'run') {
		try {
			const config = report.config as unknown as CustomReportConfig
			const results =
				config.groupBy && config.groupBy.length > 0
					? await executeGroupedReport(config, tenantFilter)
					: await executeCustomReport(config, tenantFilter)

			return json({ results })
		} catch (error) {
			return json(
				{
					error:
						error instanceof Error ? error.message : 'Failed to run report',
				},
				{ status: 400 },
			)
		}
	}

	return json({ error: 'Invalid action' }, { status: 400 })
}

export default function ViewCustomReportRoute() {
	const { report, isOwner } = useLoaderData<typeof loader>()
	const fetcher = useFetcher<{ results?: ReportResult; error?: string }>()
	const [hasRun, setHasRun] = useState(false)

	const config = report.config
	const Icon = DATA_SOURCE_ICONS[config.dataSource as DataSourceType] || FileText
	const dataSourceInfo = getDataSourceInfo(config.dataSource as DataSourceType)

	const handleRunReport = () => {
		setHasRun(true)
		fetcher.submit({ intent: 'run' }, { method: 'POST' })
	}

	const handleExport = (format: 'xlsx' | 'csv' | 'pdf') => {
		window.location.href = `/admin/resources/reports/custom/${report.id}?format=${format}`
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-start justify-between">
				<div className="flex items-center gap-4">
					<Button variant="ghost" size="icon" asChild>
						<Link to="/admin/reports/custom">
							<ArrowLeft className="h-5 w-5" />
						</Link>
					</Button>
					<div>
						<div className="flex items-center gap-3">
							<h1 className="text-2xl font-bold">{report.name}</h1>
							{report.isPublic ? (
								<Badge variant="secondary">
									<Globe className="mr-1 h-3 w-3" />
									Public
								</Badge>
							) : (
								<Badge variant="outline">
									<Lock className="mr-1 h-3 w-3" />
									Private
								</Badge>
							)}
						</div>
						{report.description && (
							<p className="mt-1 text-muted-foreground">{report.description}</p>
						)}
					</div>
				</div>

				<div className="flex gap-2">
					<Button onClick={handleRunReport} disabled={fetcher.state !== 'idle'}>
						<Play className="mr-2 h-4 w-4" />
						Run Report
					</Button>
					{isOwner && (
						<>
							<Button variant="outline" asChild>
								<Link to="edit">
									<Pencil className="mr-2 h-4 w-4" />
									Edit
								</Link>
							</Button>
							<Button variant="outline" asChild>
								<Link to="delete">
									<Trash2 className="mr-2 h-4 w-4" />
									Delete
								</Link>
							</Button>
						</>
					)}
				</div>
			</div>

			{/* Configuration Summary */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Icon className="h-5 w-5" />
						Report Configuration
					</CardTitle>
					<CardDescription>
						Created by {report.createdBy.name || report.createdBy.username} on{' '}
						{format(new Date(report.createdAt), 'MMM dd, yyyy')}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Data Source
							</p>
							<p className="mt-1">{dataSourceInfo?.label || config.dataSource}</p>
						</div>
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Fields
							</p>
							<p className="mt-1">{config.fields.length} columns</p>
						</div>
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Filters
							</p>
							<p className="mt-1">
								{config.filters.length || 'None'}{' '}
								{config.filters.length === 1 ? 'condition' : 'conditions'}
							</p>
						</div>
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Row Limit
							</p>
							<p className="mt-1">{config.limit || 100}</p>
						</div>
					</div>

					{/* Selected Fields */}
					<div className="mt-6">
						<p className="text-sm font-medium text-muted-foreground mb-2">
							Selected Fields
						</p>
						<div className="flex flex-wrap gap-2">
							{config.fields.map((field) => {
								const fieldDef = getFieldDefinition(
									config.dataSource as DataSourceType,
									field.path,
								)
								return (
									<Badge key={field.path} variant="secondary">
										{field.alias || fieldDef?.label || field.path}
									</Badge>
								)
							})}
						</div>
					</div>

					{/* Grouping */}
					{config.groupBy && config.groupBy.length > 0 && (
						<div className="mt-4">
							<p className="text-sm font-medium text-muted-foreground mb-2">
								Grouped By
							</p>
							<div className="flex flex-wrap gap-2">
								{config.groupBy.map((field) => (
									<Badge key={field} variant="outline">
										{field}
									</Badge>
								))}
							</div>
						</div>
					)}

					{/* Sorting */}
					{config.sorting.length > 0 && (
						<div className="mt-4">
							<p className="text-sm font-medium text-muted-foreground mb-2">
								Sorted By
							</p>
							<div className="flex flex-wrap gap-2">
								{config.sorting.map((sort) => (
									<Badge key={sort.field} variant="outline">
										{sort.field} ({sort.direction})
									</Badge>
								))}
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Results */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Results</CardTitle>
				</CardHeader>
				<CardContent>
					<ReportResults
						results={fetcher.data?.results}
						isLoading={fetcher.state !== 'idle'}
						error={fetcher.data?.error}
						onExport={hasRun && fetcher.data?.results ? handleExport : undefined}
					/>
				</CardContent>
			</Card>
		</div>
	)
}
