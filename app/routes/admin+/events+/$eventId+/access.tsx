import { json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useParams } from '@remix-run/react'
import { format } from 'date-fns'
import { PencilIcon, Trash2Icon, UserIcon } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const { eventId } = params

	invariantResponse(eventId, 'Event ID is required')

	// Non-global admins must have a tenant
	if (!user.isGlobalAdmin && !user.tenantId) {
		throw json({ error: 'Access denied' }, { status: 403 })
	}

	// System seed users that should be hidden from non-admin users
	const SYSTEM_SEED_USERS = [
		'focal',
		'firstvalidator',
		'secondvalidator',
		'badgeprinter',
		'dispatcher',
		'tenantadmin',
	]

	// Verify the event exists and user has access
	const event = await prisma.event.findFirst({
		where: {
			id: eventId,
			...(user.isGlobalAdmin ? {} : { tenantId: user.tenantId! }),
		},
		select: {
			id: true,
			name: true,
			tenantId: true,
		},
	})

	invariantResponse(event, 'Access denied', { status: 403 })

	// Get all access records for this event
	// For non-global admins, exclude access records for system seed users
	const allAccessRecords = await prisma.userEventAccess.findMany({
		where: {
			eventId,
			...(user.isGlobalAdmin
				? {}
				: {
						user: {
							username: { notIn: SYSTEM_SEED_USERS },
							// Also exclude global admin users
							NOT: {
								roles: {
									some: {
										name: 'admin',
									},
								},
							},
						},
					}),
		},
		select: {
			id: true,
			createdAt: true,
			user: {
				select: {
					id: true,
					username: true,
					email: true,
				},
			},
			role: {
				select: {
					id: true,
					name: true,
				},
			},
			step: {
				select: {
					id: true,
					name: true,
					workflow: {
						select: {
							participantType: {
								select: {
									name: true,
								},
							},
						},
					},
				},
			},
		},
		orderBy: { createdAt: 'desc' },
	})

	// Group access records by user + role + step name
	const groupedAccessMap = new Map<
		string,
		{
			ids: string[]
			user: { id: string; username: string; email: string }
			role: { id: string; name: string }
			stepName: string | null
			participantTypes: string[]
			createdAt: Date
		}
	>()

	for (const record of allAccessRecords) {
		const stepName = record.step?.name ?? null
		const key = `${record.user.id}-${record.role.id}-${stepName}`

		if (!groupedAccessMap.has(key)) {
			groupedAccessMap.set(key, {
				ids: [],
				user: record.user,
				role: record.role,
				stepName,
				participantTypes: [],
				createdAt: new Date(record.createdAt),
			})
		}

		const group = groupedAccessMap.get(key)!
		group.ids.push(record.id)
		if (record.step?.workflow?.participantType?.name) {
			group.participantTypes.push(record.step.workflow.participantType.name)
		}
	}

	// Convert to array and apply search/filter
	const url = new URL(request.url)
	const searchTerm = url.searchParams.get('search')?.toLowerCase() ?? ''
	const filterRoleId = url.searchParams.get('roleId')
	const filterStepName = url.searchParams.get('stepName')

	let groupedAccess = Array.from(groupedAccessMap.values())

	// Apply search filter
	if (searchTerm) {
		groupedAccess = groupedAccess.filter(
			group =>
				group.user.username.toLowerCase().includes(searchTerm) ||
				group.user.email.toLowerCase().includes(searchTerm) ||
				group.role.name.toLowerCase().includes(searchTerm) ||
				(group.stepName?.toLowerCase().includes(searchTerm) ?? false),
		)
	}

	// Apply role filter
	if (filterRoleId && filterRoleId !== 'all') {
		groupedAccess = groupedAccess.filter(
			group => group.role.id === filterRoleId,
		)
	}

	// Apply step name filter
	if (filterStepName && filterStepName !== 'all') {
		groupedAccess = groupedAccess.filter(
			group => group.stepName === filterStepName,
		)
	}

	// Simple pagination
	const page = parseInt(url.searchParams.get('page') ?? '1', 10)
	const pageSize = 10
	const totalPages = Math.ceil(groupedAccess.length / pageSize)
	const currentPage = Math.min(Math.max(1, page), Math.max(1, totalPages))
	const startIndex = (currentPage - 1) * pageSize
	const data = groupedAccess.slice(startIndex, startIndex + pageSize)

	// Get roles for filter dropdown (EVENT scoped roles only, excluding 'focal' and 'reviewer')
	// Focal and reviewer users have event-wide access, not step-specific access
	const roles = await prisma.role.findMany({
		where: {
			scope: 'EVENT',
			name: { notIn: ['focal', 'reviewer'] },
		},
		select: {
			id: true,
			name: true,
		},
		orderBy: { name: 'asc' },
	})

	// Get unique step names for filter dropdown (only assignable steps)
	const stepsRaw = await prisma.step.findMany({
		where: {
			workflow: {
				eventId: eventId,
			},
			requiresAssignment: true,
		},
		select: {
			name: true,
		},
		distinct: ['name'],
		orderBy: { name: 'asc' },
	})
	const stepNames = stepsRaw.map(s => s.name)

	// Get workflows for this event with their steps
	const workflows = await prisma.workflow.findMany({
		where: {
			eventId: eventId,
		},
		select: {
			id: true,
			name: true,
			participantType: {
				select: {
					id: true,
					name: true,
				},
			},
			steps: {
				select: {
					id: true,
					name: true,
					order: true,
					requiresAssignment: true,
				},
				orderBy: { order: 'asc' },
			},
		},
		orderBy: { name: 'asc' },
	})

	// Extract participant types from workflows
	const participantTypes = workflows.map(workflow => ({
		id: workflow.participantType.id,
		name: workflow.participantType.name,
	}))

	// Extract unique assignable step names from the first workflow
	const assignableStepNames =
		workflows.length > 0
			? workflows[0].steps
					.filter(step => step.requiresAssignment)
					.sort((a, b) => a.order - b.order)
					.map(step => step.name)
			: []

	return json({
		status: 'idle',
		event,
		accessList: data,
		totalPages,
		currentPage,
		roles,
		stepNames,
		workflows,
		participantTypes,
		assignableStepNames,
	} as const)
}

export default function EventAccessRoute() {
	const data = useLoaderData<typeof loader>()
	const { event, totalPages, currentPage, roles, stepNames, workflows } = data
	const params = useParams()
	const eventId = params.eventId

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action={`/admin/events/${eventId}/access`}
						autoSubmit={true}
						showAddButton={false}
						filters={[
							{
								name: 'roleId',
								label: 'Role',
								type: 'select',
								options: [
									{ value: 'all', label: 'All Roles' },
									...roles.map(role => ({
										value: role.id,
										label: role.name,
									})),
								],
							},
							{
								name: 'stepName',
								label: 'Step',
								type: 'select',
								options: [
									{ value: 'all', label: 'All Steps' },
									...stepNames.map(name => ({
										value: name,
										label: name,
									})),
								],
							},
						]}
						extras={[
							{
								label: 'Grant',
								to: `/admin/events/${eventId}/access/new`,
								icon: 'plus',
							},
							{
								label: 'Revoke',
								to: `/admin/events/${eventId}/access/bulk-remove`,
								icon: 'cross-1',
							},
						]}
					/>
				</div>

				<DataList
					data={data.accessList}
					columns={[
						{
							key: 'user',
							header: 'User',
							render: (access: any) => (
								<Link to={`/admin/events/${eventId}/access/${access.ids[0]}/edit?ids=${access.ids.join(',')}&stepName=${encodeURIComponent(access.stepName || '')}`} className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{access.user.username}</span>
								</Link>
							),
						},
						{
							key: 'role',
							header: 'Role',
							render: (access: any) => access.role.name,
						},
						{
							key: 'step',
							header: 'Step',
							render: (access: any) => access.stepName,
						},
						{
							key: 'participantTypes',
							header: 'Participant Types',
							render: (access: any) => (
								<span className="text-sm text-muted-foreground">
									{access.participantTypes.length > 0
										? `${access.participantTypes.length} type${access.participantTypes.length !== 1 ? 's' : ''}`
										: '-'}
								</span>
							),
						},
						{
							key: 'grantedAt',
							header: 'Granted',
							render: (access: any) =>
								format(new Date(access.createdAt), 'MMM dd, yyyy'),
						},
					]}
					actions={[
						{
							label: 'Edit',
							icon: <PencilIcon className="h-4 w-4" />,
							href: (access: any) =>
								`/admin/events/${eventId}/access/${access.ids[0]}/edit?ids=${access.ids.join(',')}&stepName=${encodeURIComponent(access.stepName || '')}`,
							variant: 'outline' as const,
						},
						{
							label: 'Revoke',
							icon: <Trash2Icon className="h-4 w-4" />,
							href: (access: any) =>
								`/admin/events/${eventId}/access/${access.ids[0]}/delete?ids=${access.ids.join(',')}`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					
					keyExtractor={access => access.ids.join('-')}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>

			{/* Outlet for modal routes (new, delete) */}
			<Outlet
				context={{
					event,
					roles,
					workflows,
					participantTypes: data.participantTypes,
					assignableStepNames: data.assignableStepNames,
				}}
			/>
		</div>
	)
}
