import { json, LoaderFunctionArgs } from '@remix-run/node'
import { Outlet, useLoaderData, useLocation } from '@remix-run/react'
import { format } from 'date-fns'
import {
	AlertCircle,
	Calendar,
	CheckCircle2,
	Clock,
	Database,
	Download,
	Eye,
	HardDrive,
	Loader2,
	Trash2,
	User,
} from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { requireGlobalAdmin } from '~/utils/auth.server'
import { getBackupStats } from '~/utils/backup.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

function formatSize(bytes: string): string {
	const numBytes = Number(bytes)
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	let unitIndex = 0
	let size = numBytes

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024
		unitIndex++
	}

	return `${size.toFixed(2)} ${units[unitIndex]}`
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireGlobalAdmin(request)
	const stats = await getBackupStats()

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } =
		await filterAndPaginate({
			request,
			model: prisma.databaseBackup,
			searchFields: ['name', 'fileName'],
			filterFields: ['status', 'backupType'],
			orderBy: [{ createdAt: 'desc' }],
			select: {
				id: true,
				name: true,
				fileName: true,
				sizeBytes: true,
				status: true,
				backupType: true,
				errorMessage: true,
				createdAt: true,
				completedAt: true,
				createdBy: {
					select: {
						id: true,
						username: true,
						name: true,
					},
				},
			},
		})

	// Convert BigInt to string for JSON serialization
	const backups = data.map(backup => ({
		...backup,
		sizeBytes: backup.sizeBytes.toString(),
	}))

	return json({
		status: 'idle' as const,
		stats: {
			totalBackups: stats.totalBackups,
			totalSize: stats.totalSize.toString(),
			lastBackupDate: stats.lastBackupDate?.toISOString() ?? null,
		},
		backups,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
	})
}

function getStatusBadge(status: string) {
	switch (status) {
		case 'COMPLETED':
			return (
				<Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
					<CheckCircle2 className="mr-1 h-3 w-3" />
					Completed
				</Badge>
			)
		case 'IN_PROGRESS':
			return (
				<Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
					<Loader2 className="mr-1 h-3 w-3 animate-spin" />
					In Progress
				</Badge>
			)
		case 'PENDING':
			return (
				<Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
					<Clock className="mr-1 h-3 w-3" />
					Pending
				</Badge>
			)
		case 'FAILED':
			return (
				<Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
					<AlertCircle className="mr-1 h-3 w-3" />
					Failed
				</Badge>
			)
		default:
			return <Badge variant="secondary">{status}</Badge>
	}
}

function getTypeBadge(type: string) {
	switch (type) {
		case 'MANUAL':
			return <Badge variant="outline">Manual</Badge>
		case 'PRE_RESTORE':
			return (
				<Badge variant="outline" className="border-orange-300 text-orange-700">
					Pre-Restore
				</Badge>
			)
		default:
			return <Badge variant="secondary">{type}</Badge>
	}
}

export default function BackupsLayout() {
	const data = useLoaderData<typeof loader>()
	const { stats, totalPages, currentPage, defaultPageSize, pageSizeOptions } = data
	const location = useLocation()

	// Check if we're on a backup detail route (not /new which should overlay the list)
	const backupIdMatch = location.pathname.match(/\/admin\/backups\/([^/]+)$/)
	const isDetailRoute = backupIdMatch && backupIdMatch[1] !== 'new'

	// If on a detail route, render only the Outlet (full page detail view)
	if (isDetailRoute) {
		return <Outlet />
	}

	return (
		<div className="space-y-6">
			{/* Outlet at top for dialogs to render as overlays */}
			<Outlet />

			<div>
				<h1 className="text-2xl font-bold tracking-tight">Database Backups</h1>
				<p className="text-muted-foreground">
					Create, manage, and restore database backups
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<CardContent className="flex items-center gap-4 pt-6">
						<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
							<Database className="h-6 w-6 text-primary" />
						</div>
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Total Backups
							</p>
							<p className="text-2xl font-bold">{stats.totalBackups}</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className="flex items-center gap-4 pt-6">
						<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
							<HardDrive className="h-6 w-6 text-primary" />
						</div>
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Total Size
							</p>
							<p className="text-2xl font-bold">
								{formatSize(stats.totalSize)}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className="flex items-center gap-4 pt-6">
						<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
							<Clock className="h-6 w-6 text-primary" />
						</div>
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Last Backup
							</p>
							<p className="text-2xl font-bold">
								{stats.lastBackupDate
									? format(new Date(stats.lastBackupDate), 'MMM d, yyyy')
									: 'Never'}
							</p>
						</div>
					</CardContent>
				</Card>
			</div>

			<SearchBar
				status={data.status}
				action="/admin/backups"
				autoSubmit={true}
				filters={[
					{
						name: 'status',
						label: 'Status',
						type: 'select',
						options: [
							{ value: 'all', label: 'All Statuses' },
							{ value: 'COMPLETED', label: 'Completed' },
							{ value: 'IN_PROGRESS', label: 'In Progress' },
							{ value: 'PENDING', label: 'Pending' },
							{ value: 'FAILED', label: 'Failed' },
						],
					},
					{
						name: 'backupType',
						label: 'Type',
						type: 'select',
						options: [
							{ value: 'all', label: 'All Types' },
							{ value: 'MANUAL', label: 'Manual' },
							{ value: 'PRE_RESTORE', label: 'Pre-Restore' },
						],
					},
				]}
			/>

			<DataList
				data={data.backups}
				columns={[
					{
						key: 'name',
						header: 'Name',
						render: (backup: any) => (
							<p className="font-medium">{backup.name}</p>
						),
					},
					{
						key: 'status',
						header: 'Status',
						render: (backup: any) => getStatusBadge(backup.status),
					},
					{
						key: 'type',
						header: 'Type',
						render: (backup: any) => getTypeBadge(backup.backupType),
					},
					{
						key: 'size',
						header: 'Size',
						render: (backup: any) => (
							<div className="flex items-center gap-2">
								<HardDrive className="h-4 w-4 text-muted-foreground" />
								<span>
									{backup.status === 'COMPLETED'
										? formatSize(backup.sizeBytes)
										: '-'}
								</span>
							</div>
						),
					},
					{
						key: 'createdBy',
						header: 'Created By',
						render: (backup: any) => (
							<div className="flex items-center gap-2">
								<User className="h-4 w-4 text-muted-foreground" />
								<span>{backup.createdBy?.name || backup.createdBy?.username}</span>
							</div>
						),
					},
					{
						key: 'createdAt',
						header: 'Date',
						render: (backup: any) => (
							<div className="flex items-center gap-2">
								<Calendar className="h-4 w-4 text-muted-foreground" />
								<span>
									{format(new Date(backup.createdAt), 'MMM d, yyyy HH:mm')}
								</span>
							</div>
						),
					},
				]}
				actions={[
					{
						label: 'View',
						icon: <Eye className="h-4 w-4" />,
						href: (backup: any) => `/admin/backups/${backup.id}`,
						variant: 'ghost' as const,
					},
					{
						label: 'Download',
						icon: <Download className="h-4 w-4" />,
						render: (backup: any) =>
							backup.status === 'COMPLETED' ? (
								<a
									href={`/admin/resources/backups/${backup.id}`}
									className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
									title="Download"
								>
									<Download className="h-4 w-4" />
								</a>
							) : null,
					},
					{
						label: 'Delete',
						icon: <Trash2 className="h-4 w-4 text-destructive" />,
						href: (backup: any) => `/admin/backups/${backup.id}/delete`,
						variant: 'ghost' as const,
					},
				]}
				status={data.status}
				
				keyExtractor={backup => backup.id}
				totalPages={totalPages}
				currentPage={currentPage}
				defaultPageSize={defaultPageSize}
				pageSizeOptions={pageSizeOptions}
			/>
		</div>
	)
}
