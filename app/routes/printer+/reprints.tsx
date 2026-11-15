import { json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useLocation } from '@remix-run/react'
import { format } from 'date-fns'
import * as React from 'react'
import { EyeIcon, ImageIcon, PrinterIcon, RefreshCw } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { SearchBar } from '~/components/search-bar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { pendingReprints } from '~/utils/reprints.server'
import { getSetting, SettingKeys } from '~/utils/settings.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['printer'])

	const pending = await pendingReprints()
	const participantIds = [...pending.keys()]

	// Get participant details
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
			],
			filterFields: [],
			orderBy: [{ updatedAt: 'desc' }],
			where: {
				id: { in: participantIds },
				deletedAt: null,
			},
			select: {
				id: true,
				email: true,
				firstName: true,
				familyName: true,
				organization: true,
				registrationCode: true,
				status: true,
				reprintCount: true,
				step: {
					select: {
						name: true,
						action: true,
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

	// Enrich participant data with reprint request info
	const enrichedData = data.map((p: any) => ({
		...p,
		reprintRequest: pending.get(p.id),
	}))

	// Get reprint settings
	const [maxReprints, reprintWarningThreshold] = await Promise.all([
		getSetting<number>(SettingKeys.REPRINT_MAX_COUNT),
		getSetting<number>(SettingKeys.REPRINT_WARNING_THRESHOLD),
	])

	return json({
		status: 'idle',
		participants: enrichedData,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		pendingCount: participantIds.length,
		maxReprints,
		reprintWarningThreshold,
	} as const)
}

export default function PrinterReprintsRoute() {
	const data = useLoaderData<typeof loader>()
	const {
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		maxReprints,
		reprintWarningThreshold,
	} = data
	const location = useLocation()
	const [ticked, setTicked] = React.useState<Set<string>>(() => new Set())

	// Check if we're on a detail page route
	const isDetailRoute =
		location.pathname !== '/printer/reprints' &&
		!location.pathname.endsWith('/badge') &&
		!location.pathname.endsWith('/print')

	if (isDetailRoute) {
		return <Outlet />
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-start gap-3">
				<div className="min-w-0 flex-1">
					<SearchBar
						status={data.status}
						action="/printer/reprints"
						autoSubmit={true}
						showAddButton={false}
						filters={[]}
					/>
				</div>
				{data.pendingCount > 0 && (
					<Button asChild>
						<Link to="/printer/reprints/print">
							<PrinterIcon className="mr-2 h-4 w-4" />
							{data.pendingCount === 1
								? 'Reprint it'
								: `Reprint all ${data.pendingCount}`}
						</Link>
					</Button>
				)}
			</div>

			{/* Table */}
			{data.participants.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-12">
						<RefreshCw className="h-12 w-12 text-muted-foreground/50" />
						<h3 className="mt-4 text-lg font-semibold">No Pending Reprints</h3>
						<p className="mt-2 text-sm text-muted-foreground">
							There are no reprint requests waiting to be fulfilled.
						</p>
					</CardContent>
				</Card>
			) : (
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
										to={`/printer/reprints/${participant.id}`}
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
							key: 'reprintCount',
							header: 'Reprints',
							render: (participant: any) => (
								<Badge
									variant="outline"
									className={
										participant.reprintCount >= reprintWarningThreshold
											? 'border-red-300 bg-red-50 text-red-700'
											: 'border-amber-300 bg-amber-50 text-amber-700'
									}
								>
									{participant.reprintCount}/{maxReprints}
								</Badge>
							),
						},
						{
							key: 'reason',
							header: 'Reason',
							render: (participant: any) => (
								<span
									className="max-w-[200px] truncate text-sm"
									title={participant.reprintRequest?.reason}
								>
									{participant.reprintRequest?.reason}
								</span>
							),
						},
						{
							key: 'requestedAt',
							header: 'Requested',
							render: (participant: any) => (
								<div className="text-sm">
									<div>
										{format(
											new Date(participant.reprintRequest?.requestedAt),
											'MMM d, yyyy',
										)}
									</div>
									<div className="text-muted-foreground">
										by {participant.reprintRequest?.requestedBy}
									</div>
								</div>
							),
						},
					]}
					actions={[
						{
							label: 'View',
							icon: <EyeIcon className="h-4 w-4" />,
							href: (participant: any) => `/printer/reprints/${participant.id}`,
							variant: 'outline' as const,
						},
						{
							label: 'Print',
							icon: <PrinterIcon className="h-4 w-4" />,
							href: (participant: any) =>
								`/printer/reprints/${participant.id}/badge`,
							variant: 'default' as const,
						},
					]}
					status={data.status}
					keyExtractor={participant => participant.id}
					selectable
					selectedIds={ticked}
					onSelectionChange={setTicked}
					renderBulkActions={ids => (
						<>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setTicked(new Set())}
							>
								Clear
							</Button>
							<Button size="sm" asChild>
								<Link
									to={`/printer/reprints/print?${new URLSearchParams({ only: [...ids].join(',') })}`}
								>
									Reprint {ids.size} selected
								</Link>
							</Button>
						</>
					)}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			)}

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
						message="You don't have permission to view reprint requests."
						redirectUrl="/printer/requests"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
