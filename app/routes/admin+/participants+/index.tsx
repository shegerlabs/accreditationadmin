import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import {
	Link,
	useFetcher,
	useLoaderData,
	useSearchParams,
} from '@remix-run/react'
import {
	ChevronDown,
	EyeIcon,
	ImageIcon,
	RotateCcw,
	Trash2,
	TrashIcon,
} from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Icon } from '~/components/ui/icon'
import { auditRequest } from '~/utils/audit.server'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { getCachedCountries } from '~/utils/cache.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import {
	participantBaseWhere,
	participantFilterFields,
	participantSearchFields,
} from '~/utils/participant-filters.server'

const RestoreParticipantSchema = z.object({
	participantId: z.string(),
})

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)
	const formData = await request.formData()

	const submission = parseWithZod(formData, {
		schema: RestoreParticipantSchema,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply(), status: 'error' as const },
			{ status: 400 },
		)
	}

	const { participantId } = submission.value

	// Restore the participant (clear deletedAt)
	const participant = await prisma.participant.update({
		where: {
			id: participantId,
			...tenantFilter,
		},
		data: {
			deletedAt: null,
		},
		select: {
			id: true,
			firstName: true,
			familyName: true,
			registrationCode: true,
		},
	})

	// Log the restore action
	await auditRequest({
		request,
		action: AuditAction.UPDATE,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participant.id,
		description: `Restored participant: ${participant.firstName} ${participant.familyName} (${participant.registrationCode})`,
	})

	return json({ result: submission.reply(), status: 'success' as const })
}

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	const url = new URL(request.url)
	const deletedFilter = url.searchParams.get('deleted') || 'active'

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } =
		await filterAndPaginate({
			request,
			model: prisma.participant,
			where: participantBaseWhere(url, tenantFilter),
			searchFields: participantSearchFields,
			filterFields: participantFilterFields,
			orderBy: [{ createdAt: 'desc' }],
			select: {
				id: true,
				email: true,
				firstName: true,
				familyName: true,
				organization: true,
				registrationCode: true,
				status: true,
				attendClosedSession: true,
				wishList: true,
				deletedAt: true,
				step: {
					select: {
						name: true,
						action: true,
						role: {
							select: {
								name: true,
							},
						},
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
			},
		})

	const participantTypes = await prisma.participantType.findMany({
		where: tenantFilter,
		select: {
			id: true,
			name: true,
		},
	})

	const meetingTypes = await prisma.meetingType.findMany({
		where: tenantFilter,
		select: {
			id: true,
			name: true,
		},
	})

	// Countries are global data - use cached version
	const countries = await getCachedCountries()

	const invitations = await prisma.invitation.findMany({
		where: tenantFilter,
		select: {
			organization: true,
		},
		distinct: ['organization'],
	})

	// Fetch tenants for global admins to filter by
	const tenants = user.isGlobalAdmin
		? await prisma.tenant.findMany({
				select: {
					id: true,
					name: true,
				},
				orderBy: { name: 'asc' },
			})
		: []

	return json({
		status: 'idle',
		participants: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		participantTypes,
		countries,
		meetingTypes,
		invitations,
		tenants,
		deletedFilter,
		isAdmin: user.isGlobalAdmin || user.isTenantAdmin,
		isGlobalAdmin: user.isGlobalAdmin,
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
		countries,
		meetingTypes,
		invitations,
		tenants,
		deletedFilter,
		isAdmin,
		isGlobalAdmin,
	} = data
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
	const [searchParams] = useSearchParams()
	const fetcher = useFetcher()

	// Build export URL with either selected IDs or current filters
	const nothingToExport = data.participants.length === 0

	const buildExportUrl = (basePath: string) => {
		const params = new URLSearchParams(searchParams)
		if (selectedIds.size > 0) {
			params.set('selectedIds', Array.from(selectedIds).join(','))
		}
		return `${basePath}${params.size ? '?' + params.toString() : ''}`
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/participants"
						autoSubmit={true}
						showAddButton={false}
						filterDisplay="popover"
						filters={[
							{
								name: 'tenantId',
								label: 'Tenant',
								type: 'select',
								options: [
									{ value: 'all', label: 'All Tenants' },
									...tenants.map(tenant => ({
										value: tenant.id,
										label: tenant.name,
									})),
								],
								show: isGlobalAdmin,
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
								name: 'wishList',
								label: 'Wish List',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...meetingTypes.map(meetingType => ({
										value: meetingType.id,
										label: meetingType.name,
									})),
								],
							},
							{
								name: 'nationalityId',
								label: 'Nationality',
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
								name: 'status',
								label: 'Status',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'INPROGRESS', label: 'In Progress' },
									{ value: 'REJECTED', label: 'Rejected' },
									{ value: 'PRINTED', label: 'Printed' },
									{ value: 'BYPASSED', label: 'Bypassed' },
								],
							},
							{
								name: 'stage',
								label: 'Stage',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'stuck', label: 'Stuck (System Steps)' },
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
							{
								name: 'organization',
								label: 'Invitation',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...invitations.map(invitation => ({
										value: invitation.organization,
										label: invitation.organization,
									})),
								],
							},
							{
								name: 'deleted',
								label: 'Show',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'active', label: 'Active' },
									{ value: 'deleted', label: 'Deleted' },
								],
								show: isAdmin,
							},
						]}
						renderExtra={
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button size="sm" className="gap-1">
										<Icon name="download" size="sm" />
										Export
										{selectedIds.size > 0 && ` (${selectedIds.size})`}
										<ChevronDown className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem asChild disabled={nothingToExport}>
										<a
											href={buildExportUrl('/admin/resources/participants')}
											className="flex items-center gap-2"
										>
											Export Excel
										</a>
									</DropdownMenuItem>
									<DropdownMenuItem asChild disabled={nothingToExport}>
										<a
											href={buildExportUrl(
												'/admin/resources/participants-screening',
											)}
											className="flex items-center gap-2"
										>
											Screening List (Excel)
										</a>
									</DropdownMenuItem>
									<DropdownMenuItem asChild disabled={nothingToExport}>
										<a
											href={buildExportUrl('/admin/resources/participants-vip')}
											className="flex items-center gap-2"
										>
											VIP List with Photos (Word)
										</a>
									</DropdownMenuItem>
									<DropdownMenuItem asChild disabled={nothingToExport}>
										<a
											href={buildExportUrl('/admin/resources/photos')}
											className="flex items-center gap-2"
										>
											Download Photos
										</a>
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						}
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
										to={`/admin/participants/${participant.id}${searchParams.size ? '?' + searchParams.toString() : ''}`}
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
							render: (participant: any) => participant.participantType.name,
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
							key: 'organization',
							header: 'Organization',
							render: (participant: any) => participant.organization,
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
							key: 'step',
							header: 'Stage',
							render: (participant: any) => (
								<div className="flex items-center">
									<span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-700/10">
										{participant.step?.role?.name === 'reviewer'
											? 'focal person'
											: participant.step?.role?.name}
									</span>
								</div>
							),
						},
					]}
					actions={[
						{
							label: 'Documents',
							icon: <EyeIcon className="h-4 w-4" />,
							href: (participant: any) =>
								`/admin/participants/${participant.id}${searchParams.size ? '?' + searchParams.toString() : ''}`,
							variant: 'outline' as const,
						},
						{
							label: 'Restore',
							icon: <RotateCcw className="h-4 w-4" />,
							onClick: (participant: any) => {
								fetcher.submit(
									{ participantId: participant.id },
									{ method: 'POST' },
								)
							},
							variant: 'default' as const,
							show: (participant: any) => participant.deletedAt !== null,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (participant: any) =>
								`/admin/participants/${participant.id}/delete${searchParams.size ? '?' + searchParams.toString() : ''}`,
							variant: 'outline' as const,
							show: (participant: any) => participant.deletedAt === null,
						},
						{
							label: 'Delete Permanently',
							icon: <Trash2 className="h-4 w-4" />,
							href: (participant: any) =>
								`/admin/participants/${participant.id}/delete-permanently${searchParams.size ? '?' + searchParams.toString() : ''}`,
							variant: 'destructive' as const,
							show: (participant: any) =>
								participant.deletedAt !== null && isGlobalAdmin,
						},
					]}
					status={data.status}
					
					keyExtractor={participant => participant.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
					selectable={true}
					selectedIds={selectedIds}
					onSelectionChange={setSelectedIds}
				/>
			</div>
		</div>
	)
}
