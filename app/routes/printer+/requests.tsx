import { Action, type Prisma } from '@prisma/client'
import { json, LoaderFunctionArgs } from '@remix-run/node'
import {
	Link,
	Outlet,
	useLoaderData,
	useLocation,
	useSearchParams,
} from '@remix-run/react'
import {
	format,
	isToday,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subDays,
} from 'date-fns'
import { EyeIcon, ImageIcon } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { SearchBar } from '~/components/search-bar'

import { Badge } from '~/components/ui/badge'
import {
	getUserAccessibleStepInfo,
	requireUserWithRoles,
} from '~/utils/auth.server'
import { getCachedCountries } from '~/utils/cache.server'
import {
	buildFilteredWhere,
	filterAndPaginate,
	prisma,
	type FilterField,
	type SearchField,
} from '~/utils/db.server'
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { calculateSlaStatus } from '~/utils/sla'
import { ISSUED_STATUSES, REPRINT_REMARK_PREFIX } from '~/utils/badge-status'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])

	// Get step IDs and participant type IDs the user has access to via UserEventAccess
	const {
		stepIds: accessibleStepIds,
		participantTypeIds: accessibleParticipantTypeIds,
	} = await getUserAccessibleStepInfo(user.id, ['printer'])

	const url = new URL(request.url)
	const statusFilter = parseStatusFilter(url.searchParams.get('status'))
	const reprintedFilter = url.searchParams.get('reprinted')

	// Show participants at printer steps OR already PRINTED participants from those steps
	// Also filter by participant type for defense-in-depth
	const stepFilter: Prisma.ParticipantWhereInput = {
		deletedAt: null,
		participantTypeId: { in: accessibleParticipantTypeIds },
		OR: [
			{ stepId: { in: accessibleStepIds } },
			{
				status: { in: [...ISSUED_STATUSES] },
				approvals: {
					some: { action: Action.PRINT, stepId: { in: accessibleStepIds } },
				},
			},
		],
	}

	// Printed: list the prints (in the window, if any), latest first, one row
	// per person. With a window, First print / Reprint is about those prints;
	// otherwise it's about the badge (reprinted at some point or not).
	const window = statusFilter.kind === 'printed' ? statusFilter.window : null
	const prints =
		statusFilter.kind === 'printed'
			? await prisma.approval.findMany({
					where: {
						action: Action.PRINT,
						stepId: { in: accessibleStepIds },
						...(window && { createdAt: window }),
						...(window &&
							reprintedFilter === 'yes' && {
								remarks: { startsWith: REPRINT_REMARK_PREFIX },
							}),
						...(window &&
							reprintedFilter === 'no' && {
								NOT: { remarks: { startsWith: REPRINT_REMARK_PREFIX } },
							}),
					},
					orderBy: { createdAt: 'desc' },
					distinct: ['participantId'],
					select: {
						participantId: true,
						createdAt: true,
						remarks: true,
						user: { select: { name: true, username: true } },
					},
				})
			: null
	const printById = new Map(
		prints?.map(a => [
			a.participantId,
			{
				at: a.createdAt,
				by: a.user.name || a.user.username,
				reprint: a.remarks?.startsWith(REPRINT_REMARK_PREFIX) ?? false,
			},
		]),
	)

	const conditions: Prisma.ParticipantWhereInput[] = [stepFilter]
	if (statusFilter.kind === 'awaiting') {
		// Bypassed people at a print step are waiting to be printed too.
		conditions.push({
			stepId: { in: accessibleStepIds },
			status: { notIn: [...ISSUED_STATUSES] },
		})
	}
	if (prints) {
		conditions.push({
			status: { in: [...ISSUED_STATUSES] },
			id: { in: prints.map(a => a.participantId) },
		})
	}
	if (!window) {
		if (reprintedFilter === 'no') conditions.push({ reprintCount: 0 })
		if (reprintedFilter === 'yes') conditions.push({ reprintCount: { gt: 0 } })
	}

	const listArgs = {
		request,
		model: prisma.participant,
		searchFields: [
			'email',
			'organization',
			'registrationCode',
			'firstName',
			'familyName',
			{ tenant: 'name' },
			{ event: 'name' },
			{ participantType: 'name' },
			{ country: 'name' },
		] as SearchField[],
		filterFields: [
			'participantTypeId',
			'countryId',
			'organization',
			{ field: 'attendClosedSession', isBoolean: true },
		] as FilterField[],
		orderBy: [{ createdAt: 'desc' as const }],
		where: { AND: conditions },
		select: {
			id: true,
			email: true,
			firstName: true,
			familyName: true,
			organization: true,
			registrationCode: true,
			status: true,
			reprintCount: true,
			attendClosedSession: true,
			createdAt: true,
			step: {
				select: {
					name: true,
					action: true,
					slaDurationMinutes: true,
				},
			},
			tenant: {
				select: {
					name: true,
				},
			},
			event: {
				select: {
					name: true,
				},
			},
			participantType: {
				select: {
					name: true,
				},
			},
			country: {
				select: {
					name: true,
				},
			},
			documents: {
				where: {
					documentType: 'PHOTO',
				},
				select: {
					id: true,
				},
				take: 1,
			},
			approvals: {
				orderBy: { createdAt: 'desc' },
				take: 1,
				select: {
					createdAt: true,
				},
			},
		} satisfies Prisma.ParticipantSelect,
	}
	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } =
		prints
			? await paginateInOrder(
					listArgs,
					prints.map(a => a.participantId),
				)
			: await filterAndPaginate(listArgs)

	// Get SLA warning threshold from settings
	const slaWarningThreshold = await getSetting<number>(
		SettingKeys.SLA_WARNING_THRESHOLD_PERCENT,
	)

	// Calculate SLA status for each participant
	// Cast to any to access select fields that TypeScript doesn't infer from filterAndPaginate
	const participantsWithSla = (data as any[]).map(participant => {
		const stepEnteredAt = participant.approvals?.[0]?.createdAt
			? new Date(participant.approvals[0].createdAt)
			: new Date(participant.createdAt)

		const slaInfo = calculateSlaStatus(
			stepEnteredAt,
			participant.step?.slaDurationMinutes ?? null,
			slaWarningThreshold,
		)

		return {
			...participant,
			slaInfo,
			lastPrint: printById.get(participant.id) ?? null,
		}
	})

	// Filter by SLA status if specified
	const slaStatusFilter = url.searchParams.get('slaStatus')
	const filteredParticipants =
		slaStatusFilter && slaStatusFilter !== 'all'
			? participantsWithSla.filter(p => p.slaInfo.status === slaStatusFilter)
			: participantsWithSla

	const participantTypes = await prisma.participantType.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	// Get unique organizations from participants at accessible steps (including PRINTED)
	const organizations = await prisma.participant.groupBy({
		by: ['organization'],
		where: stepFilter,
		orderBy: {
			organization: 'asc',
		},
	})

	const countries = await getCachedCountries()

	return json({
		status: 'idle',
		participants: filteredParticipants,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		participantTypes,
		organizations: organizations.map(o => o.organization),
		countries,
		printed: statusFilter.kind === 'printed',
	} as const)
}

export default function PrinterRequestsRoute() {
	const data = useLoaderData<typeof loader>()
	const {
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		participantTypes,
		organizations,
		countries,
	} = data
	const location = useLocation()
	const [searchParams] = useSearchParams()
	const paramsSuffix = searchParams.size ? '?' + searchParams.toString() : ''

	// Check if we're on a detail page route - if so, only render Outlet
	const isDetailRoute =
		location.pathname !== '/printer/requests' &&
		!location.pathname.endsWith('/badge') &&
		!location.pathname.endsWith('/print') &&
		!location.pathname.endsWith('/reprint')

	if (isDetailRoute) {
		return <Outlet />
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/printer/requests"
						autoSubmit={true}
						showAddButton={false}
						filterDisplay="popover"
						filters={[
							{
								name: 'status',
								label: 'Status',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'awaiting', label: 'Awaiting print' },
									{ value: 'printed-today', label: 'Printed today' },
									{ value: 'printed-yesterday', label: 'Printed yesterday' },
									{ value: 'printed-week', label: 'Printed this week' },
									{ value: 'printed-month', label: 'Printed this month' },
									{ value: 'printed', label: 'Printed (any time)' },
								],
							},
							{
								name: 'reprinted',
								label: 'First print or reprint',
								type: 'select',
								options: [
									{ value: 'all', label: 'Both' },
									{ value: 'no', label: 'First prints' },
									{ value: 'yes', label: 'Reprints' },
								],
							},
							{
								name: 'organization',
								label: 'Organization',
								type: 'select',
								options: [
									{ value: 'all', label: 'All Organizations' },
									...organizations.map(org => ({
										value: org,
										label: org,
									})),
								],
							},
							{
								name: 'participantTypeId',
								label: 'Participant Type',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...participantTypes
										.filter(pt => pt.name !== 'Any')
										.map(participantType => ({
											value: participantType.id,
											label: participantType.name,
										})),
								],
							},
							{
								name: 'countryId',
								label: 'Country',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...countries.map(country => ({
										value: country.id,
										label: country.name,
									})),
								],
							},
							{
								name: 'attendClosedSession',
								label: 'Session',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'true', label: 'Closed' },
									{ value: 'false', label: 'Open' },
								],
							},
						]}
					/>
				</div>

				<DataList
					data={data.participants}
					columns={[
						{
							key: 'name',
							header: 'Participant',
							render: (participant: any) => {
								const photo = participant.documents?.[0]
								return (
									<Link
										to={`/printer/requests/${participant.id}${paramsSuffix}`}
										className="flex items-center gap-3"
									>
										{photo ? (
											<img
												src={`/admin/resources/participants/${photo.id}?mode=inline`}
												alt={`${participant.firstName} ${participant.familyName}`}
												className="h-10 w-10 rounded-full object-cover"
												loading="lazy"
												onError={e => {
													const target = e.target as HTMLImageElement
													target.style.display = 'none'
													if (target.parentElement) {
														target.parentElement.innerHTML = `<div class="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><svg class="h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></div>`
													}
												}}
											/>
										) : (
											<div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
												<ImageIcon className="h-5 w-5 text-muted-foreground" />
											</div>
										)}
										<div>
											<div className="font-medium">
												{participant.registrationCode}
											</div>
											<div className="text-sm text-muted-foreground">
												{participant.firstName} {participant.familyName}
											</div>
										</div>
									</Link>
								)
							},
						},
						{
							key: 'organization',
							header: 'Organization',
							render: (participant: any) => participant.organization,
						},
						{
							key: 'participantType',
							header: 'Type',
							render: (participant: any) => participant.participantType?.name,
						},
						{
							key: 'session',
							header: 'Session',
							render: (participant: any) => (
								<Badge
									variant={
										participant.attendClosedSession ? 'default' : 'secondary'
									}
								>
									{participant.attendClosedSession ? 'Closed' : 'Open'}
								</Badge>
							),
						},
						{
							key: 'country',
							header: 'Country',
							render: (participant: any) => participant.country?.name,
						},
						...(data.printed
							? [
									{
										key: 'printed',
										header: 'Printed',
										render: (participant: any) =>
											participant.lastPrint && (
												<div className="whitespace-nowrap tabular-nums">
													<div>
														{format(
															new Date(participant.lastPrint.at),
															isToday(new Date(participant.lastPrint.at))
																? 'HH:mm'
																: 'd MMM, HH:mm',
														)}
													</div>
													<div className="text-sm text-muted-foreground">
														{participant.lastPrint.by}
														{participant.lastPrint.reprint && ' · Reprint'}
													</div>
												</div>
											),
									},
								]
							: []),
						{
							key: 'status',
							header: 'Status',
							render: (participant: any) => {
								// Bypassed people at a print step are awaiting print too;
								// archived badges are printed and filed.
								const awaiting =
									'bg-orange-100 text-orange-800 hover:bg-orange-100/80'
								const printed =
									'bg-green-100 text-green-800 hover:bg-green-100/80'
								const archived =
									'bg-purple-100 text-purple-800 hover:bg-purple-100/80'
								const statuses: Record<string, [string, string]> = {
									INPROGRESS: ['Awaiting print', awaiting],
									BYPASSED: ['Awaiting print', awaiting],
									PRINTED: ['Printed', printed],
									COLLECTED: ['Archived', archived],
									ARCHIVED: ['Archived', archived],
								}
								const [label, className] = statuses[participant.status] ?? [
									participant.status,
									'',
								]
								return (
									<Badge className={className}>
										{label}
										{participant.reprintCount > 0 &&
											` (${participant.reprintCount})`}
									</Badge>
								)
							},
						},
					]}
					actions={[
						{
							label: 'View',
							icon: <EyeIcon className="h-4 w-4" />,
							href: (participant: any) =>
								`/printer/requests/${participant.id}${paramsSuffix}`,
							variant: 'outline' as const,
						},
						// {
						// 	label: 'Print Badge',
						// 	icon: <PrinterIcon className="h-4 w-4" />,
						// 	href: (participant: any) =>
						// 		`/printer/requests/${participant.id}/badge`,
						// 	variant: 'default' as const,
						// 	show: (participant: any) => participant.status === 'INPROGRESS',
						// },
					]}
					status={data.status}
					keyExtractor={participant => participant.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			</div>

			{/* Outlet for dialog routes (badge, print) */}
			<Outlet />
		</div>
	)
}

/**
 * The Status filter: awaiting print, or printed in a window (null for any
 * time). Old INPROGRESS / BYPASSED / PRINTED links still work.
 */
function parseStatusFilter(
	value: string | null,
):
	| { kind: 'all' }
	| { kind: 'awaiting' }
	| { kind: 'printed'; window: { gte: Date; lt?: Date } | null } {
	const today = startOfDay(new Date())
	switch (value) {
		case 'awaiting':
		case 'INPROGRESS':
		case 'BYPASSED':
			return { kind: 'awaiting' }
		case 'printed':
		case 'PRINTED':
			return { kind: 'printed', window: null }
		case 'printed-today':
			return { kind: 'printed', window: { gte: today } }
		case 'printed-yesterday':
			return { kind: 'printed', window: { gte: subDays(today, 1), lt: today } }
		case 'printed-week':
			return {
				kind: 'printed',
				window: { gte: startOfWeek(today, { weekStartsOn: 1 }) },
			}
		case 'printed-month':
			return { kind: 'printed', window: { gte: startOfMonth(today) } }
		default:
			return { kind: 'all' }
	}
}

/**
 * Like filterAndPaginate, but in the order of `orderedIds` (latest print
 * first), which Prisma can't sort by. The ids are one per person printed in
 * the window, so this stays small.
 */
async function paginateInOrder(
	{ request, searchFields, filterFields, where, select }: any,
	orderedIds: string[],
) {
	const url = new URL(request.url)
	const page = parseInt(url.searchParams.get('page') || '1', 10)
	const pageSizeParam = url.searchParams.get('pageSize')
	const defaultPageSize = await getSetting<number>(
		SettingKeys.PAGINATION_DEFAULT_PAGE_SIZE,
	)
	const pageSize =
		pageSizeParam === 'All'
			? undefined
			: parseInt(pageSizeParam || String(defaultPageSize), 10)

	const matching = new Set(
		(
			await prisma.participant.findMany({
				where: buildFilteredWhere({ url, searchFields, filterFields, where }),
				select: { id: true },
			})
		).map(p => p.id),
	)
	const ids = orderedIds.filter(id => matching.has(id))
	const pageIds = pageSize
		? ids.slice((page - 1) * pageSize, page * pageSize)
		: ids
	const rows = await prisma.participant.findMany({
		where: { id: { in: pageIds } },
		select,
	})
	const byId = new Map(rows.map((r: any) => [r.id, r]))
	return {
		data: pageIds.map(id => byId.get(id)).filter(Boolean),
		totalPages: pageSize ? Math.ceil(ids.length / pageSize) : 1,
		currentPage: page,
		defaultPageSize,
		pageSizeOptions: [10, 20, 50, 100],
	}
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You don't have permission to view print requests."
						redirectUrl="/printer/requests"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
