import { json, LoaderFunctionArgs } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { format, startOfMonth } from 'date-fns'
import { CheckCircle, Clock, Eye, XCircle } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { requireUser } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUser(request)
	const url = new URL(request.url)
	const fromDate = url.searchParams.get('fromDate')
	const toDate = url.searchParams.get('toDate')

	// Build where clause with optional date range filter
	const where: { userId: string; createdAt?: { gte?: Date; lte?: Date } } = {
		userId: user.id,
	}

	if (fromDate || toDate) {
		where.createdAt = {}
		if (fromDate) {
			where.createdAt.gte = new Date(fromDate)
		}
		if (toDate) {
			const endDate = new Date(toDate)
			endDate.setDate(endDate.getDate() + 1)
			where.createdAt.lte = endDate
		}
	}

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.approval,
		where,
		searchFields: [
			{ participant: 'firstName' },
			{ participant: 'familyName' },
			{ participant: 'registrationCode' },
			{ participant: 'organization' },
		],
		filterFields: ['result'],
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			result: true,
			remarks: true,
			createdAt: true,
			participant: {
				select: {
					id: true,
					firstName: true,
					familyName: true,
					organization: true,
					registrationCode: true,
					participantType: {
						select: {
							name: true,
						},
					},
					event: {
						select: {
							name: true,
						},
					},
				},
			},
			step: {
				select: {
					name: true,
					action: true,
				},
			},
		},
	})

	// Get stats (total counts for all time)
	const stats = await prisma.approval.groupBy({
		by: ['result'],
		where: {
			userId: user.id,
		},
		_count: true,
	})

	const statsMap = {
		total: stats.reduce((sum, s) => sum + s._count, 0),
		approved: stats.find(s => s.result === 'SUCCESS')?._count ?? 0,
		rejected: stats.find(s => s.result === 'FAILURE')?._count ?? 0,
		skipped: stats.find(s => s.result === 'SKIPPED')?._count ?? 0,
	}

	// Default dates for filters
	const today = new Date()
	const defaultFromDate = format(startOfMonth(today), 'yyyy-MM-dd')
	const defaultToDate = format(today, 'yyyy-MM-dd')

	return json({
		status: 'idle',
		approvals: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		stats: statsMap,
		defaultFromDate,
		defaultToDate,
	} as const)
}

function getResultBadge(result: string) {
	switch (result) {
		case 'SUCCESS':
			return (
				<Badge variant="default" className="bg-green-600">
					<CheckCircle className="mr-1 h-3 w-3" />
					Approved
				</Badge>
			)
		case 'FAILURE':
			return (
				<Badge variant="destructive">
					<XCircle className="mr-1 h-3 w-3" />
					Rejected
				</Badge>
			)
		case 'SKIPPED':
			return (
				<Badge variant="secondary">
					<Clock className="mr-1 h-3 w-3" />
					Skipped
				</Badge>
			)
		default:
			return <Badge variant="outline">{result}</Badge>
	}
}

export default function ApprovalHistoryRoute() {
	const {
		status,
		approvals,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		stats,
		defaultFromDate,
		defaultToDate,
	} = useLoaderData<typeof loader>()

	return (
		<div className="flex flex-col gap-6">
			{/* Stats */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Processed
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{stats.total}</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Approved
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-green-600">
							{stats.approved}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Rejected
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-red-600">
							{stats.rejected}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Skipped
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-gray-600">
							{stats.skipped}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Search and Filter */}
			<SearchBar
				status={status}
				action="/validator/history"
				autoSubmit={true}
				showAddButton={false}
				filterDisplay="popover"
				filters={[
					{
						name: 'fromDate',
						label: 'From date',
						type: 'date',
						defaultValue: defaultFromDate,
					},
					{
						name: 'toDate',
						label: 'To date',
						type: 'date',
						defaultValue: defaultToDate,
					},
					{
						name: 'result',
						label: 'Result',
						type: 'select',
						options: [
							{ value: 'all', label: 'All' },
							{ value: 'SUCCESS', label: 'Approved' },
							{ value: 'FAILURE', label: 'Rejected' },
							{ value: 'SKIPPED', label: 'Skipped' },
						],
					},
				]}
			/>

			{/* Table */}
			<DataList
				data={approvals}
				columns={[
					{
						key: 'registrationCode',
						header: 'Reg. Code',
						render: (approval: any) => approval.participant.registrationCode,
					},
					{
						key: 'name',
						header: 'Name',
						render: (approval: any) =>
							`${approval.participant.firstName} ${approval.participant.familyName}`,
					},
					{
						key: 'type',
						header: 'Type',
						render: (approval: any) =>
							approval.participant.participantType?.name || 'N/A',
					},
					{
						key: 'step',
						header: 'Step',
						render: (approval: any) => approval.step.name,
					},
					{
						key: 'date',
						header: 'Date',
						render: (approval: any) =>
							format(new Date(approval.createdAt), 'MMM d, yyyy h:mm a'),
					},
					{
						key: 'result',
						header: 'Result',
						render: (approval: any) => getResultBadge(approval.result),
					},
				]}
				actions={[
					{
						label: 'View',
						icon: <Eye className="h-4 w-4" />,
						href: (approval: any) =>
							`/validator/history/${approval.participant.id}`,
						variant: 'outline' as const,
					},
				]}
				status={status}
				
				keyExtractor={approval => approval.id}
				totalPages={totalPages}
				currentPage={currentPage}
				defaultPageSize={defaultPageSize}
				pageSizeOptions={pageSizeOptions}
			/>

			<Outlet />
		</div>
	)
}
