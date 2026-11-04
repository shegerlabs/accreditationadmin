import { Country } from '@prisma/client'
import { json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData, useOutletContext, useSearchParams } from '@remix-run/react'
import { EyeIcon, ImageIcon } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'

import { Badge } from '~/components/ui/badge'
import {
	getUserAccessibleStepInfo,
	requireUserWithRoles,
} from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { calculateSlaStatus } from '~/utils/sla'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['validator', 'reviewer'])

	// Get step IDs and participant type IDs the user has access to via UserEventAccess
	const { stepIds: accessibleStepIds, participantTypeIds: accessibleParticipantTypeIds } =
		await getUserAccessibleStepInfo(user.id, ['validator', 'reviewer'])

	// Only show participants at steps the user is assigned to, with matching participant type (excluding soft-deleted)
	const stepFilter = {
		stepId: { in: accessibleStepIds },
		participantTypeId: { in: accessibleParticipantTypeIds },
		deletedAt: null,
	}

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } =
		await filterAndPaginate({
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
	const slaWarningThreshold = await getSetting<number>(
		SettingKeys.SLA_WARNING_THRESHOLD_PERCENT,
	)

	// Calculate SLA status for each participant
	// Cast to any to access select fields that TypeScript doesn't infer from filterAndPaginate
	const participantsWithSla = (data as any[]).map(participant => {
		// Use last approval time as step entry time, or createdAt if no approvals
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

	const tenants = await prisma.tenant.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const events = await prisma.event.findMany({
		select: {
			id: true,
			name: true,
		},
	})

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

	return json({
		status: 'idle',
		participants: filteredParticipants,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		tenants,
		events,
		participantTypes,
		organizations: organizations.map(o => o.organization),
	} as const)
}

export default function IndexRoute() {
	const data = useLoaderData<typeof loader>()
	const {
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		participantTypes,
		organizations,
	} = data
	const [searchParams] = useSearchParams()
	const paramsSuffix = searchParams.size ? '?' + searchParams.toString() : ''
	const { countries } = useOutletContext<{
		countries: Country[]
	}>()

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/validator/requests"
						autoSubmit={true}
						showAddButton={false}
						filterDisplay="inline"
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
										to={`/validator/requests/${participant.id}${paramsSuffix}`}
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
									REJECTED: 'bg-red-100 text-red-800 hover:bg-red-100/80',
									PRINTED: 'bg-green-100 text-green-800 hover:bg-green-100/80',
									APPROVED: 'bg-blue-100 text-blue-800 hover:bg-blue-100/80',
								}
								return (
									<Badge
										className={
											statusStyles[
												participant.status as keyof typeof statusStyles
											] ?? ''
										}
									>
										{participant.status}
									</Badge>
								)
							},
						},
						{
							key: 'organization',
							header: 'Organization',
							render: (participant: any) => participant.organization,
						},
					]}
					actions={[
						{
							label: 'Documents',
							icon: <EyeIcon className="h-4 w-4" />,
							href: (participant: any) =>
								`/validator/requests/${participant.id}${paramsSuffix}`,
							variant: 'outline' as const,
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
		</div>
	)
}
