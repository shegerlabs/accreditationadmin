import { json, LoaderFunctionArgs } from '@remix-run/node'
import {
	Link,
	Outlet,
	useLoaderData,
	useLocation,
	useSearchParams,
} from '@remix-run/react'
import { EyeIcon, ImageIcon, PackageCheckIcon, ScanLineIcon, XIcon } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { SearchBar } from '~/components/search-bar'

import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import {
	getUserAccessibleStepIds,
	requireUserWithRoles,
} from '~/utils/auth.server'
import { getCachedCountries } from '~/utils/cache.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { calculateSlaStatus } from '~/utils/sla'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['dispatcher'])

	// Get step IDs the user has access to via UserEventAccess
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['dispatcher'])

	// Only show participants at steps the user is assigned to (excluding soft-deleted)
	const stepFilter = { stepId: { in: accessibleStepIds }, deletedAt: null }

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
	const url = new URL(request.url)
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

	// Get unique organizations from participants at accessible steps
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

export default function DispatcherRequestsRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions, participantTypes, organizations, countries } =
		data
	const [searchParams, setSearchParams] = useSearchParams()
	const location = useLocation()

	// Get selected IDs from URL search params
	const selectedParam = searchParams.get('selected') || ''
	const selectedIds = new Set(selectedParam.split(',').filter(Boolean))

	// Get only PRINTED participants for bulk selection
	const printedParticipants = data.participants.filter(
		p => p.status === 'PRINTED',
	)
	const allPrintedSelected =
		printedParticipants.length > 0 &&
		printedParticipants.every(p => selectedIds.has(p.id))

	const updateSelection = (newSelectedIds: Set<string>) => {
		const newParams = new URLSearchParams(searchParams)
		if (newSelectedIds.size > 0) {
			newParams.set('selected', Array.from(newSelectedIds).join(','))
		} else {
			newParams.delete('selected')
		}
		setSearchParams(newParams, { preventScrollReset: true })
	}

	const toggleSelect = (id: string) => {
		const newSelected = new Set(selectedIds)
		if (newSelected.has(id)) {
			newSelected.delete(id)
		} else {
			newSelected.add(id)
		}
		updateSelection(newSelected)
	}

	const toggleSelectAll = () => {
		if (allPrintedSelected) {
			updateSelection(new Set())
		} else {
			updateSelection(new Set(printedParticipants.map(p => p.id)))
		}
	}

	const clearSelection = () => {
		updateSelection(new Set())
	}

	// Build params suffix for navigation links (exclude 'selected' param which is for bulk actions)
	const filterParams = new URLSearchParams(searchParams)
	filterParams.delete('selected')
	const paramsSuffix = filterParams.size ? '?' + filterParams.toString() : ''

	// Get current organization filter for highlighting
	const currentOrgFilter = searchParams.get('organization') || 'all'

	// Check if we're on a detail page route - if so, only render Outlet
	// Show list for: /dispatcher/requests, /dispatcher/requests/:id/collect, and /dispatcher/requests/bulk-collect
	const isDetailRoute =
		location.pathname !== '/dispatcher/requests' &&
		!location.pathname.endsWith('/collect') &&
		!location.pathname.endsWith('/bulk-collect') &&
		!location.pathname.endsWith('/scan-collect')

	if (isDetailRoute) {
		return <Outlet />
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/dispatcher/requests"
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
									{ value: 'PRINTED', label: 'Printed (Awaiting Collection)' },
									{ value: 'COLLECTED', label: 'Collected' },
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
						renderExtra={
							<Button size="sm" variant="outline" asChild>
								<Link to={`/dispatcher/requests/scan-collect${paramsSuffix}`}>
									<ScanLineIcon className="mr-2 h-4 w-4" />
									Scan to Collect
								</Link>
							</Button>
						}
					/>
				</div>

				{/* Bulk Actions Bar - only show when items are selected */}
				{selectedIds.size > 0 && (
					<div className="mb-4 flex items-center gap-4 rounded-lg border bg-muted p-3">
						<span className="text-sm font-medium">
							{selectedIds.size} badge(s) selected
						</span>
						<Button
							size="sm"
							asChild
						>
							<Link to={`/dispatcher/requests/bulk-collect?${searchParams.toString()}`}>
								<PackageCheckIcon className="mr-2 h-4 w-4" />
								Collect Selected
							</Link>
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={clearSelection}
						>
							<XIcon className="mr-1 h-4 w-4" />
							Clear Selection
						</Button>
					</div>
				)}

				<DataList
					data={data.participants}
					columns={[
						{
							key: 'select',
							header:
								printedParticipants.length > 0 ? (
									<Checkbox
										checked={allPrintedSelected}
										onCheckedChange={toggleSelectAll}
										aria-label="Select all"
									/>
								) : (
									''
								),
							render: (participant: any) => {
								if (participant.status !== 'PRINTED') return null
								return (
									<Checkbox
										checked={selectedIds.has(participant.id)}
										onCheckedChange={() => toggleSelect(participant.id)}
										onClick={e => e.stopPropagation()}
										aria-label={`Select ${participant.firstName} ${participant.familyName}`}
									/>
								)
							},
						},
						{
							key: 'name',
							header: 'Participant',
							render: (participant: any) => {
								const photo = participant.documents?.[0]
								return (
									<Link
										to={`/dispatcher/requests/${participant.id}${paramsSuffix}`}
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
							render: (participant: any) => (
								<span
									className={
										currentOrgFilter !== 'all' &&
										participant.organization === currentOrgFilter
											? 'font-semibold text-primary'
											: ''
									}
								>
									{participant.organization}
								</span>
							),
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
									PRINTED: 'bg-amber-100 text-amber-800 hover:bg-amber-100/80',
									COLLECTED:
										'bg-green-100 text-green-800 hover:bg-green-100/80',
									INPROGRESS:
										'bg-orange-100 text-orange-800 hover:bg-orange-100/80',
								}
								return (
									<Badge
										className={
											statusStyles[
												participant.status as keyof typeof statusStyles
											] ?? ''
										}
									>
										{participant.status === 'PRINTED'
											? 'Awaiting Collection'
											: participant.status}
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
								`/dispatcher/requests/${participant.id}${paramsSuffix}`,
							variant: 'outline' as const,
						},
						{
							label: 'Collect',
							icon: <PackageCheckIcon className="h-4 w-4" />,
							href: (participant: any) =>
								`/dispatcher/requests/${participant.id}/collect${paramsSuffix}`,
							variant: 'default' as const,
							show: (participant: any) => participant.status === 'PRINTED',
						},
					]}
					status={data.status}
					
					keyExtractor={participant => participant.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			</div>

			{/* Outlet for dialog routes (collect, bulk-collect) */}
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
						message="You don't have permission to view badge collection requests."
						redirectUrl="/dispatcher/requests"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
