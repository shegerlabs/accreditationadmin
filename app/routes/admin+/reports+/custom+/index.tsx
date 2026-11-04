import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Link, Outlet, useLoaderData } from '@remix-run/react'
import { format } from 'date-fns'
import {
	Eye,
	FileText,
	Globe,
	Lock,
	Mail,
	Pencil,
	Shield,
	Tag,
	Trash2,
	Users,
} from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Badge } from '~/components/ui/badge'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import type { DataSourceType } from '~/utils/custom-report-types'
import { filterAndPaginate, prisma } from '~/utils/db.server'

// Icon mapping for data sources
const DATA_SOURCE_ICONS: Record<
	DataSourceType,
	React.ComponentType<{ className?: string }>
> = {
	Participant: Users,
	Invitation: Mail,
	AuditLog: FileText,
	ParticipantType: Tag,
	Country: Globe,
	Restriction: Shield,
}

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	// Handle isPublic filter manually since it's a boolean
	const url = new URL(request.url)
	const isPublicParam = url.searchParams.get('isPublic')
	const isPublicFilter =
		isPublicParam === 'true'
			? { isPublic: true }
			: isPublicParam === 'false'
				? { isPublic: false }
				: {}

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } =
		await filterAndPaginate({
			request,
			model: prisma.customReport,
			searchFields: ['name', 'description'],
			filterFields: ['dataSource'],
			orderBy: [{ updatedAt: 'desc' }],
			where: {
				...tenantFilter,
				...isPublicFilter,
				OR: [{ isPublic: true }, { createdById: user.id }],
			},
			select: {
				id: true,
				name: true,
				description: true,
				dataSource: true,
				isPublic: true,
				createdAt: true,
				updatedAt: true,
				createdById: true,
				createdBy: {
					select: {
						id: true,
						name: true,
						username: true,
					},
				},
			},
		})

	return json({
		status: 'idle' as const,
		reports: data,
		currentUserId: user.id,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
	})
}

export default function CustomReportsIndexRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions, currentUserId } = data

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/reports/custom"
						autoSubmit={true}
						filters={[
							{
								name: 'dataSource',
								label: 'Data Source',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'Participant', label: 'Participant' },
									{ value: 'Approval', label: 'Approval' },
									{ value: 'Invitation', label: 'Invitation' },
									{ value: 'Event', label: 'Event' },
									{ value: 'AuditLog', label: 'Audit Log' },
									{ value: 'User', label: 'User' },
									{ value: 'Workflow', label: 'Workflow' },
									{ value: 'Step', label: 'Step' },
									{ value: 'ParticipantType', label: 'Participant Type' },
									{ value: 'Meeting', label: 'Meeting' },
									{ value: 'Venue', label: 'Venue' },
									{ value: 'Country', label: 'Country' },
									{ value: 'Restriction', label: 'Restriction' },
								],
							},
							{
								name: 'isPublic',
								label: 'Visibility',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'true', label: 'Public' },
									{ value: 'false', label: 'Private' },
								],
							},
						]}
					/>
				</div>
				<DataList
					data={data.reports}
					columns={[
						{
							key: 'name',
							header: 'Report Name',
							render: (report: any) => (
								<div>
									<Link
										to={report.id}
										className="font-medium hover:underline"
									>
										{report.name}
									</Link>
									{report.description && (
										<p className="text-sm text-muted-foreground truncate max-w-[300px]">
											{report.description}
										</p>
									)}
								</div>
							),
						},
						{
							key: 'dataSource',
							header: 'Data Source',
							render: (report: any) => {
								const Icon =
									DATA_SOURCE_ICONS[report.dataSource as DataSourceType] ||
									FileText
								return (
									<div className="flex items-center gap-2">
										<Icon className="h-4 w-4 text-muted-foreground" />
										<span>{report.dataSource}</span>
									</div>
								)
							},
						},
						{
							key: 'isPublic',
							header: 'Visibility',
							render: (report: any) =>
								report.isPublic ? (
									<Badge variant="secondary">
										<Globe className="mr-1 h-3 w-3" />
										Public
									</Badge>
								) : (
									<Badge variant="outline">
										<Lock className="mr-1 h-3 w-3" />
										Private
									</Badge>
								),
						},
						{
							key: 'createdBy',
							header: 'Created By',
							render: (report: any) =>
								report.createdBy?.name || report.createdBy?.username || '-',
						},
						{
							key: 'updatedAt',
							header: 'Last Updated',
							render: (report: any) =>
								format(new Date(report.updatedAt), 'MMM dd, yyyy'),
						},
					]}
					actions={[
						{
							label: 'View',
							icon: <Eye className="h-4 w-4" />,
							href: (report: any) => report.id,
							variant: 'ghost' as const,
						},
						{
							label: 'Edit',
							icon: <Pencil className="h-4 w-4" />,
							href: (report: any) => `${report.id}/edit`,
							variant: 'ghost' as const,
							show: (report: any) => report.createdById === currentUserId,
						},
						{
							label: 'Delete',
							icon: <Trash2 className="h-4 w-4" />,
							href: (report: any) => `${report.id}/delete`,
							variant: 'ghost' as const,
							show: (report: any) => report.createdById === currentUserId,
						},
					]}
					status={data.status}
					
					keyExtractor={(report) => report.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			</div>

			<Outlet />
		</div>
	)
}
