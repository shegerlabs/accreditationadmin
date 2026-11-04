import { json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, Outlet, useLoaderData } from '@remix-run/react'
import { format } from 'date-fns'
import {
	AlertCircle,
	ArrowLeft,
	Calendar,
	CheckCircle2,
	Clock,
	Code,
	Database,
	Download,
	FileText,
	HardDrive,
	Loader2,
	Trash2,
	User,
} from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Separator } from '~/components/ui/separator'
import { requireGlobalAdmin } from '~/utils/auth.server'
import { getBackupPreview } from '~/utils/backup.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

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

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireGlobalAdmin(request)
	const { backupId } = params

	const backup = await prisma.databaseBackup.findUnique({
		where: { id: backupId },
		include: {
			createdBy: {
				select: {
					id: true,
					username: true,
					name: true,
					email: true,
				},
			},
		},
	})

	invariantResponse(backup, 'Backup not found', { status: 404 })

	// Get preview if backup is completed
	let preview: {
		schema: { content: string; totalLines: number; truncated: boolean }
		data: { content: string; totalLines: number; truncated: boolean }
	} | null = null
	if (backup.status === 'COMPLETED') {
		try {
			preview = await getBackupPreview(backupId!, 200)
		} catch {
			// Preview not available
		}
	}

	return json({
		backup: {
			...backup,
			sizeBytes: backup.sizeBytes.toString(),
		},
		preview,
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

export default function BackupDetailRoute() {
	const { backup, preview } = useLoaderData<typeof loader>()
	const isCompleted = backup.status === 'COMPLETED'

	return (
		<div className="space-y-6">
			<Outlet />

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								<Database className="h-5 w-5" />
								{backup.name}
							</CardTitle>
							<CardDescription className="mt-1">
								<div className="flex items-center gap-2">
									{getStatusBadge(backup.status)}
									{getTypeBadge(backup.backupType)}
								</div>
							</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							<Link to="/admin/backups">
								<Button variant="ghost" size="sm">
									<ArrowLeft className="mr-2 h-4 w-4" />
									Back
								</Button>
							</Link>
							{isCompleted && (
								<Button variant="outline" size="sm" asChild>
									<a href={`/admin/resources/backups/${backup.id}`}>
										<Download className="mr-2 h-4 w-4" />
										Download
									</a>
								</Button>
							)}
							<Link to={`/admin/backups/${backup.id}/delete`}>
								<Button variant="destructive" size="sm">
									<Trash2 className="mr-2 h-4 w-4" />
									Delete
								</Button>
							</Link>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="grid gap-6 md:grid-cols-2">
						<div className="space-y-4">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
									<FileText className="h-5 w-5 text-muted-foreground" />
								</div>
								<div>
									<p className="text-sm text-muted-foreground">File Name</p>
									<p className="font-mono text-sm">{backup.fileName}</p>
								</div>
							</div>

							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
									<HardDrive className="h-5 w-5 text-muted-foreground" />
								</div>
								<div>
									<p className="text-sm text-muted-foreground">File Size</p>
									<p className="font-medium">
										{isCompleted ? formatSize(backup.sizeBytes) : '-'}
									</p>
								</div>
							</div>

							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
									<User className="h-5 w-5 text-muted-foreground" />
								</div>
								<div>
									<p className="text-sm text-muted-foreground">Created By</p>
									<p className="font-medium">
										{backup.createdBy?.name || backup.createdBy?.username}
									</p>
									<p className="text-sm text-muted-foreground">
										{backup.createdBy?.email}
									</p>
								</div>
							</div>
						</div>

						<div className="space-y-4">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
									<Calendar className="h-5 w-5 text-muted-foreground" />
								</div>
								<div>
									<p className="text-sm text-muted-foreground">Created At</p>
									<p className="font-medium">
										{format(new Date(backup.createdAt), 'MMM d, yyyy HH:mm:ss')}
									</p>
								</div>
							</div>

							{backup.startedAt && (
								<div className="flex items-center gap-3">
									<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
										<Clock className="h-5 w-5 text-muted-foreground" />
									</div>
									<div>
										<p className="text-sm text-muted-foreground">Started At</p>
										<p className="font-medium">
											{format(
												new Date(backup.startedAt),
												'MMM d, yyyy HH:mm:ss'
											)}
										</p>
									</div>
								</div>
							)}

							{backup.completedAt && (
								<div className="flex items-center gap-3">
									<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
										<CheckCircle2 className="h-5 w-5 text-muted-foreground" />
									</div>
									<div>
										<p className="text-sm text-muted-foreground">Completed At</p>
										<p className="font-medium">
											{format(
												new Date(backup.completedAt),
												'MMM d, yyyy HH:mm:ss'
											)}
										</p>
									</div>
								</div>
							)}
						</div>
					</div>

					{backup.errorMessage && (
						<>
							<Separator />
							<div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
								<div className="flex items-start gap-3">
									<AlertCircle className="h-5 w-5 text-destructive" />
									<div>
										<p className="font-medium text-destructive">Error Message</p>
										<p className="mt-1 text-sm">{backup.errorMessage}</p>
									</div>
								</div>
							</div>
						</>
					)}

					{preview && (
						<>
							<Separator />
							<div className="grid gap-6 lg:grid-cols-2">
								{/* Schema Preview Card */}
								<Card>
									<CardHeader className="pb-3">
										<div className="flex items-center justify-between">
											<CardTitle className="flex items-center gap-2 text-base">
												<Code className="h-4 w-4" />
												Schema
											</CardTitle>
											<span className="text-xs text-muted-foreground">
												{preview.schema.truncated
													? `${preview.schema.totalLines.toLocaleString()} lines`
													: `${preview.schema.totalLines.toLocaleString()} lines`}
											</span>
										</div>
										<CardDescription>
											Database structure (types, tables, constraints, indexes)
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="max-h-[400px] overflow-auto rounded-lg border bg-muted/50">
											<pre className="w-full overflow-x-auto p-4 text-xs leading-relaxed">
												<code className="block whitespace-pre-wrap break-all">{preview.schema.content}</code>
											</pre>
										</div>
									</CardContent>
								</Card>

								{/* Data Preview Card */}
								<Card>
									<CardHeader className="pb-3">
										<div className="flex items-center justify-between">
											<CardTitle className="flex items-center gap-2 text-base">
												<Database className="h-4 w-4" />
												Data
											</CardTitle>
											<span className="text-xs text-muted-foreground">
												{preview.data.truncated
													? `${preview.data.totalLines.toLocaleString()} lines`
													: `${preview.data.totalLines.toLocaleString()} lines`}
											</span>
										</div>
										<CardDescription>
											Table data (INSERT statements)
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="max-h-[400px] overflow-auto rounded-lg border bg-muted/50">
											<pre className="w-full overflow-x-auto p-4 text-xs leading-relaxed">
												<code className="block whitespace-pre-wrap break-all">{preview.data.content}</code>
											</pre>
										</div>
									</CardContent>
								</Card>
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
