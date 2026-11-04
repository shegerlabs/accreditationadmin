import { json, LoaderFunctionArgs } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { format, startOfMonth, startOfWeek } from 'date-fns'
import { Eye, PackageCheck } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['dispatcher'])
	const url = new URL(request.url)
	const fromDate = url.searchParams.get('fromDate')
	const toDate = url.searchParams.get('toDate')
	const dispatcherId = url.searchParams.get('dispatcherId')

	// Get all users with dispatcher role for the filter dropdown
	const dispatchers = await prisma.user.findMany({
		where: {
			roles: {
				some: {
					name: 'dispatcher',
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

	// Build where clause - show COLLECT actions, optionally filtered by dispatcher
	const where: {
		userId?: string
		action: 'COLLECT'
		createdAt?: { gte?: Date; lte?: Date }
	} = {
		action: 'COLLECT',
	}

	// Filter by selected dispatcher if provided (and not "all")
	if (dispatcherId && dispatcherId !== 'all') {
		where.userId = dispatcherId
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
		filterFields: [],
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			result: true,
			remarks: true,
			createdAt: true,
			user: {
				select: {
					username: true,
					name: true,
				},
			},
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

	// Get stats for COLLECT actions (filtered by dispatcher if selected)
	const today = new Date()
	const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
	const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 })
	const startOfThisMonth = startOfMonth(today)

	const statsWhere: { userId?: string; action: 'COLLECT' } = { action: 'COLLECT' }
	if (dispatcherId && dispatcherId !== 'all') {
		statsWhere.userId = dispatcherId
	}

	const [totalCollected, collectedToday, collectedThisWeek, collectedThisMonth] = await Promise.all([
		prisma.approval.count({
			where: statsWhere,
		}),
		prisma.approval.count({
			where: {
				...statsWhere,
				createdAt: { gte: startOfToday },
			},
		}),
		prisma.approval.count({
			where: {
				...statsWhere,
				createdAt: { gte: startOfThisWeek },
			},
		}),
		prisma.approval.count({
			where: {
				...statsWhere,
				createdAt: { gte: startOfThisMonth },
			},
		}),
	])

	// Default dates for filters
	const defaultFromDate = format(startOfThisMonth, 'yyyy-MM-dd')
	const defaultToDate = format(today, 'yyyy-MM-dd')

	return json({
		status: 'idle',
		approvals: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		stats: {
			total: totalCollected,
			today: collectedToday,
			thisWeek: collectedThisWeek,
			thisMonth: collectedThisMonth,
		},
		dispatchers,
		defaultFromDate,
		defaultToDate,
	} as const)
}

export default function CollectionHistoryRoute() {
	const {
		status,
		approvals,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		stats,
		dispatchers,
		defaultFromDate,
		defaultToDate,
	} = useLoaderData<typeof loader>()

	// Build dispatcher options for the filter dropdown
	const dispatcherOptions = [
		{ value: 'all', label: 'All Dispatchers' },
		...dispatchers.map(dispatcher => ({
			value: dispatcher.id,
			label: dispatcher.name || dispatcher.username,
		})),
	]

	return (
		<div className="flex flex-col gap-6">
			{/* Stats */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Collected
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
						<div className="text-2xl font-bold text-green-600">
							{stats.today}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							This Week
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-green-600">
							{stats.thisWeek}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							This Month
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-green-600">
							{stats.thisMonth}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Search and Filter */}
			<SearchBar
				status={status}
				action="/dispatcher/history"
				autoSubmit={true}
				showAddButton={false}
				filterDisplay="popover"
				filters={[
					{
						name: 'dispatcherId',
						label: 'Dispatcher',
						type: 'select',
						options: dispatcherOptions,
						defaultValue: 'all',
					},
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
				]}
			/>

			{/* Table */}
			<DataList
				data={approvals}
				columns={[
					{
						key: 'registrationCode',
						header: 'Reg. Code',
						render: (approval: any) => (
							<span className="font-mono font-medium">
								{approval.participant.registrationCode}
							</span>
						),
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
						key: 'event',
						header: 'Event',
						render: (approval: any) =>
							approval.participant.event?.name || 'N/A',
					},
					{
						key: 'collectedBy',
						header: 'Collected By',
						render: (approval: any) =>
							approval.user?.name || approval.user?.username || 'N/A',
					},
					{
						key: 'date',
						header: 'Collected At',
						render: (approval: any) =>
							format(new Date(approval.createdAt), 'MMM d, yyyy h:mm a'),
					},
					{
						key: 'status',
						header: 'Status',
						render: () => (
							<Badge className="bg-green-600">
								<PackageCheck className="mr-1 h-3 w-3" />
								Collected
							</Badge>
						),
					},
				]}
				actions={[
					{
						label: 'View',
						icon: <Eye className="h-4 w-4" />,
						href: (approval: any) =>
							`/dispatcher/history/${approval.participant.id}`,
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
