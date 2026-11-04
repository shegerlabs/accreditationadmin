import { Action, RequestStatus } from '@prisma/client'
import { json, LoaderFunctionArgs } from '@remix-run/node'
import {
	Link,
	Outlet,
	useLoaderData,
	useLocation,
	useSearchParams,
} from '@remix-run/react'
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
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { calculateSlaStatus } from '~/utils/sla'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])

	// Get step IDs and participant type IDs the user has access to via UserEventAccess
	const { stepIds: accessibleStepIds, participantTypeIds: accessibleParticipantTypeIds } =
		await getUserAccessibleStepInfo(user.id, ['printer'])

	// Handle reprinted filter from URL params
	const url = new URL(request.url)
	const reprintedFilter = url.searchParams.get('reprinted')
	const reprintCondition =
		reprintedFilter === 'no'
			? { reprintCount: 0 }
			: reprintedFilter === 'yes'
				? { reprintCount: { gt: 0 } }
				: {}

	// Show participants at printer steps OR already PRINTED participants from those steps
	// Also filter by participant type for defense-in-depth
	const stepFilter = {
		deletedAt: null,
		participantTypeId: { in: accessibleParticipantTypeIds },
		...reprintCondition,
		OR: [
			{ stepId: { in: accessibleStepIds } },
			{
				status: { in: [RequestStatus.PRINTED, RequestStatus.COLLECTED] },
				approvals: {
					some: { action: Action.PRINT, stepId: { in: accessibleStepIds } },
				},
			},
		],
	}

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
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
		],
		filterFields: [
			'participantTypeId',
			'status',
			'countryId',
			'organization',
			{ field: 'attendClosedSession', isBoolean: true },
		],
		orderBy: [{ createdAt: 'desc' }],
		where: stepFilter,
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
		},
	})

	// Get SLA warning threshold from settings
	const slaWarningThreshold = await getSetting<number>(SettingKeys.SLA_WARNING_THRESHOLD_PERCENT)

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
	} as const)
}

export default function PrinterRequestsRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions, participantTypes, organizations, countries } =
		data
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
								name: 'status',
								label: 'Status',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'INPROGRESS', label: 'Awaiting Print' },
									{ value: 'PRINTED', label: 'Printed' },
									{ value: 'COLLECTED', label: 'Collected' },
									{ value: 'BYPASSED', label: 'Bypassed' },
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
								name: 'reprinted',
								label: 'Reprinted',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'no', label: 'Never Reprinted' },
									{ value: 'yes', label: 'Reprinted' },
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
									variant={participant.attendClosedSession ? 'default' : 'secondary'}
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
						{
							key: 'status',
							header: 'Status',
							render: (participant: any) => {
								const statusStyles = {
									INPROGRESS:
										'bg-orange-100 text-orange-800 hover:bg-orange-100/80',
									PRINTED: 'bg-green-100 text-green-800 hover:bg-green-100/80',
									APPROVED: 'bg-blue-100 text-blue-800 hover:bg-blue-100/80',
									COLLECTED:
										'bg-purple-100 text-purple-800 hover:bg-purple-100/80',
									BYPASSED:
										'bg-amber-100 text-amber-800 hover:bg-amber-100/80',
								}
								const label =
									participant.status === 'INPROGRESS'
										? 'Awaiting Print'
										: participant.status
								return (
									<Badge
										className={
											statusStyles[
												participant.status as keyof typeof statusStyles
											] ?? ''
										}
									>
										{label}
										{participant.reprintCount > 0 && ` (${participant.reprintCount})`}
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
