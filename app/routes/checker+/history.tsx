import { json, LoaderFunctionArgs } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { format } from 'date-fns'
import { Eye } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { AuditAction, AuditEntityType } from '@prisma/client'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['checkpoint'])
	const url = new URL(request.url)
	const officerId = url.searchParams.get('officerId')
	const result = url.searchParams.get('result')
	const session = url.searchParams.get('session')

	// Get all users with checkpoint role for the filter dropdown
	const officers = await prisma.user.findMany({
		where: {
			roles: {
				some: {
					name: 'checkpoint',
				},
			},
		},
		select: {
			id: true,
			name: true,
			username: true,
		},
		orderBy: { name: 'asc' },
	})

	const search = url.searchParams.get('search')?.trim()

	// Build where clause for VERIFY actions on PARTICIPANT entities
	const where: Record<string, any> = {
		action: AuditAction.VERIFY,
		entityType: AuditEntityType.PARTICIPANT,
	}

	if (officerId && officerId !== 'all') {
		where.userId = officerId
	}

	// Build metadata filters (result and session both filter on metadata JSON)
	const metadataConditions: Record<string, any>[] = []
	if (result && result !== 'all') {
		metadataConditions.push({ metadata: { path: ['result'], equals: result } })
	}
	if (session && session !== 'all') {
		metadataConditions.push({ metadata: { path: ['session'], equals: session } })
	}
	if (metadataConditions.length === 1) {
		Object.assign(where, metadataConditions[0])
	} else if (metadataConditions.length > 1) {
		where.AND = metadataConditions
	}

	// Search across description and metadata JSON fields
	if (search) {
		where.OR = [
			{ description: { contains: search, mode: 'insensitive' } },
			{ metadata: { path: ['firstName'], string_contains: search } },
			{ metadata: { path: ['familyName'], string_contains: search } },
			{ metadata: { path: ['registrationCode'], string_contains: search } },
		]
	}

	// Strip 'search' param so filterAndPaginate doesn't add an empty OR condition
	// (we handle search manually above via metadata JSON fields)
	const fpUrl = new URL(request.url)
	fpUrl.searchParams.delete('search')
	const fpRequest = new Request(fpUrl.toString(), request)

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } =
		await filterAndPaginate({
			request: fpRequest,
			model: prisma.auditLog,
			where,
			searchFields: [],
			filterFields: [],
			orderBy: [{ createdAt: 'desc' }],
			select: {
				id: true,
				entityId: true,
				description: true,
				metadata: true,
				createdAt: true,
				user: {
					select: {
						username: true,
						name: true,
					},
				},
			},
		})

	// Compute stats
	const today = new Date()
	const startOfToday = new Date(
		today.getFullYear(),
		today.getMonth(),
		today.getDate(),
	)

	const statsWhere: {
		action: 'VERIFY'
		entityType: 'PARTICIPANT'
		userId?: string
	} = {
		action: AuditAction.VERIFY,
		entityType: AuditEntityType.PARTICIPANT,
	}
	if (officerId && officerId !== 'all') {
		statsWhere.userId = officerId
	}

	const [totalScans, scansToday, validToday, invalidToday] =
		await Promise.all([
			prisma.auditLog.count({ where: statsWhere }),
			prisma.auditLog.count({
				where: { ...statsWhere, createdAt: { gte: startOfToday } },
			}),
			prisma.auditLog.count({
				where: {
					...statsWhere,
					createdAt: { gte: startOfToday },
					metadata: { path: ['result'], equals: 'valid' },
				},
			}),
			prisma.auditLog.count({
				where: {
					...statsWhere,
					createdAt: { gte: startOfToday },
					metadata: { path: ['result'], equals: 'invalid' },
				},
			}),
		])

	return json({
		status: 'idle',
		scans: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		stats: {
			total: totalScans,
			today: scansToday,
			validToday,
			invalidToday,
		},
		officers,
	} as const)
}

function ResultBadge({ result }: { result: string }) {
	switch (result) {
		case 'valid':
			return <Badge className="bg-green-600">Valid</Badge>
		case 'duplicate':
			return <Badge className="bg-amber-500">Duplicate</Badge>
		case 'invalid':
			return <Badge className="bg-red-600">Invalid</Badge>
		default:
			return <Badge variant="secondary">{result}</Badge>
	}
}

export default function CheckerHistoryRoute() {
	const {
		status,
		scans,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		stats,
		officers,
	} = useLoaderData<typeof loader>()

	const officerOptions = [
		{ value: 'all', label: 'All Officers' },
		...officers.map(o => ({
			value: o.id,
			label: o.name || o.username,
		})),
	]

	return (
		<div className="flex flex-col gap-6 p-4">
			{/* Stats */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Scans
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{stats.total}</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Today
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-blue-600">
							{stats.today}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Valid Today
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-green-600">
							{stats.validToday}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Invalid Today
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-red-600">
							{stats.invalidToday}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Search and Filter */}
			<SearchBar
				status={status}
				action="/checker/history"
				autoSubmit={true}
				showAddButton={false}
				filterDisplay="popover"
				filters={[
					{
						name: 'result',
						label: 'Result',
						type: 'select',
						options: [
							{ value: 'all', label: 'All Results' },
							{ value: 'valid', label: 'Valid' },
							{ value: 'duplicate', label: 'Duplicate' },
							{ value: 'invalid', label: 'Invalid' },
						],
						defaultValue: 'all',
					},
					{
						name: 'session',
						label: 'Session',
						type: 'select',
						options: [
							{ value: 'all', label: 'All Sessions' },
							{ value: 'open', label: 'Open (O)' },
							{ value: 'closed', label: 'Closed (C)' },
							{ value: 'executive', label: 'Executive (CX)' },
						],
						defaultValue: 'all',
					},
					{
						name: 'officerId',
						label: 'Officer',
						type: 'select',
						options: officerOptions,
						defaultValue: 'all',
					},
				]}
			/>

			{/* Table */}
			<DataList
				data={scans}
				columns={[
					{
						key: 'name',
						header: 'Name',
						render: (scan: any) => {
							const meta = scan.metadata as Record<string, any> | null
							if (meta?.firstName) {
								return `${meta.firstName} ${meta.familyName ?? ''}`
							}
							return '-'
						},
					},
					{
						key: 'registrationCode',
						header: 'Reg. Code',
						render: (scan: any) => {
							const meta = scan.metadata as Record<string, any> | null
							return meta?.registrationCode ? (
								<span className="font-mono font-medium">
									{meta.registrationCode}
								</span>
							) : (
								'-'
							)
						},
					},
					{
						key: 'type',
						header: 'Type',
						render: (scan: any) => {
							const meta = scan.metadata as Record<string, any> | null
							return meta?.participantType ?? '-'
						},
					},
					{
						key: 'result',
						header: 'Result',
						render: (scan: any) => {
							const meta = scan.metadata as Record<string, any> | null
							return <ResultBadge result={meta?.result ?? 'unknown'} />
						},
					},
					{
						key: 'scannedBy',
						header: 'Scanned By',
						render: (scan: any) =>
							scan.user?.name || scan.user?.username || 'N/A',
					},
					{
						key: 'time',
						header: 'Time',
						render: (scan: any) =>
							format(new Date(scan.createdAt), 'MMM d, yyyy h:mm a'),
					},
				]}
				actions={[
					{
						label: 'View',
						icon: <Eye className="h-4 w-4" />,
						href: (scan: any) => `/checker/history/${scan.entityId}`,
						show: (scan: any) => !!scan.entityId,
						variant: 'outline' as const,
					},
				]}
				status={status}
				keyExtractor={scan => scan.id}
				totalPages={totalPages}
				currentPage={currentPage}
				defaultPageSize={defaultPageSize}
				pageSizeOptions={pageSizeOptions}
			/>

			<Outlet />
		</div>
	)
}
