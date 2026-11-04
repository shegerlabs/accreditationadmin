import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { format } from 'date-fns'
import {
	ActivityIcon,
	BuildingIcon,
	CalendarIcon,
	EyeIcon,
	FileIcon,
	TrashIcon,
	UserIcon,
} from 'lucide-react'
import { useState } from 'react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	// System seed users that should be hidden from tenant admins
	const SYSTEM_SEED_USERS = [
		'focal',
		'firstvalidator',
		'secondvalidator',
		'badgeprinter',
		'dispatcher',
		'tenantadmin',
	]

	// For tenant admins, exclude audit logs from system seed users and global admins
	const whereFilter = user.isGlobalAdmin
		? tenantFilter
		: {
				...tenantFilter,
				// Exclude audit logs from system seed users
				user: {
					username: { notIn: SYSTEM_SEED_USERS },
					// Also exclude audit logs from global admins
					NOT: {
						roles: {
							some: {
								name: 'admin',
							},
						},
					},
				},
			}

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.auditLog,
		where: whereFilter,
		searchFields: ['description', 'entityId'],
		filterFields: ['entityType', 'action', 'tenantId'],
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			action: true,
			entityType: true,
			entityId: true,
			description: true,
			createdAt: true,
			ipAddress: true,
			userAgent: true,
			user: {
				select: {
					username: true,
					email: true,
				},
			},
			tenant: {
				select: {
					id: true,
					name: true,
				},
			},
			metadata: true,
		},
	})

	// Get tenants for global admin filter dropdown
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
		audits: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		tenants,
		isGlobalAdmin: user.isGlobalAdmin,
	} as const)
}

export default function AuditsRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions } = data
	const [selectedAudit, setSelectedAudit] = useState<any>(null)

	const getActionIcon = (action: string) => {
		switch (action) {
			case 'CREATE':
				return <FileIcon className="h-4 w-4 text-green-500" />
			case 'UPDATE':
				return <ActivityIcon className="h-4 w-4 text-blue-500" />
			case 'DELETE':
				return <TrashIcon className="h-4 w-4 text-red-500" />
			case 'LOGIN':
			case 'LOGOUT':
			case 'SESSION_REVOKE':
				return <UserIcon className="h-4 w-4 text-purple-500" />
			case 'LOGIN_FAILED':
				return <UserIcon className="h-4 w-4 text-red-500" />
			case 'PASSWORD_RESET':
			case 'PASSWORD_CHANGE':
			case 'TWO_FACTOR_ENABLE':
			case 'TWO_FACTOR_DISABLE':
				return <UserIcon className="h-4 w-4 text-orange-500" />
			case 'APPROVE':
				return <ActivityIcon className="h-4 w-4 text-green-500" />
			case 'REJECT':
				return <ActivityIcon className="h-4 w-4 text-red-500" />
			case 'PRINT':
			case 'REPRINT':
				return <FileIcon className="h-4 w-4 text-blue-500" />
			case 'COLLECT':
				return <FileIcon className="h-4 w-4 text-green-500" />
			case 'BYPASS':
				return <ActivityIcon className="h-4 w-4 text-yellow-500" />
			case 'VERIFY':
				return <EyeIcon className="h-4 w-4 text-teal-500" />
			case 'IMPERSONATE':
			case 'IMPERSONATE_END':
				return <UserIcon className="h-4 w-4 text-yellow-500" />
			default:
				return <ActivityIcon className="h-4 w-4 text-gray-500" />
		}
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/audits"
						autoSubmit={true}
						showAddButton={false}
						filters={[
							// Tenant filter (only for global admins)
							...(data.isGlobalAdmin
								? [
										{
											name: 'tenantId',
											label: 'Tenant',
											type: 'select' as const,
											options: [
												{ value: 'all', label: 'All Tenants' },
												...data.tenants.map(tenant => ({
													value: tenant.id,
													label: tenant.name,
												})),
											],
										},
									]
								: []),
							{
								name: 'action',
								label: 'Action',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'CREATE', label: 'Create' },
									{ value: 'UPDATE', label: 'Update' },
									{ value: 'DELETE', label: 'Delete' },
									{ value: 'LOGIN', label: 'Login' },
									{ value: 'LOGIN_FAILED', label: 'Login Failed' },
									{ value: 'LOGOUT', label: 'Logout' },
									{ value: 'PASSWORD_RESET', label: 'Password Reset' },
									{ value: 'PASSWORD_CHANGE', label: 'Password Change' },
									{ value: 'TWO_FACTOR_ENABLE', label: '2FA Enable' },
									{ value: 'TWO_FACTOR_DISABLE', label: '2FA Disable' },
									{ value: 'SESSION_REVOKE', label: 'Session Revoke' },
									{ value: 'APPROVE', label: 'Approve' },
									{ value: 'REJECT', label: 'Reject' },
									{ value: 'EXPORT', label: 'Export' },
									{ value: 'IMPORT', label: 'Import' },
									{ value: 'PRINT', label: 'Print' },
									{ value: 'COLLECT', label: 'Collect' },
									{ value: 'BYPASS', label: 'Bypass' },
									{ value: 'REPRINT', label: 'Reprint' },
									{ value: 'VERIFY', label: 'Verify' },
									{ value: 'IMPERSONATE', label: 'Impersonate' },
									{ value: 'IMPERSONATE_END', label: 'Impersonate End' },
									{ value: 'OTHER', label: 'Other' },
								],
							},
							{
								name: 'entityType',
								label: 'Entity Type',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'USER', label: 'User' },
									{ value: 'PARTICIPANT', label: 'Participant' },
									{ value: 'EVENT', label: 'Event' },
									{ value: 'MEETING', label: 'Meeting' },
									{ value: 'VENUE', label: 'Venue' },
									{ value: 'WORKFLOW', label: 'Workflow' },
									{ value: 'INVITATION', label: 'Invitation' },
									{ value: 'TEMPLATE', label: 'Template' },
									{ value: 'SESSION', label: 'Session' },
									{ value: 'SYSTEM', label: 'System' },
								],
							},
						]}
					/>
				</div>
				<DataList
					data={data.audits}
					columns={[
						{
							key: 'action',
							header: 'Action',
							render: (audit: any) => (
								<div className="flex items-center space-x-2">
									{getActionIcon(audit.action)}
									<span>{audit.action}</span>
								</div>
							),
						},
						{
							key: 'description',
							header: 'Description',
							render: (audit: any) => (
								<div className="max-w-md truncate">{audit.description}</div>
							),
						},
						{
							key: 'user',
							header: 'User',
							render: (audit: any) =>
								audit.user ? (
									<div className="flex items-center space-x-2">
										<span>{audit.user.username}</span>
									</div>
								) : (
									'System'
								),
						},
						// Tenant column (only for global admins)
						...(data.isGlobalAdmin
							? [
									{
										key: 'tenant',
										header: 'Tenant',
										render: (audit: any) =>
											audit.tenant ? (
												<div className="flex items-center space-x-2">
													<BuildingIcon className="h-4 w-4 text-primary" />
													<span>{audit.tenant.name}</span>
												</div>
											) : (
												<span className="text-muted-foreground">-</span>
											),
									},
								]
							: []),
						{
							key: 'createdAt',
							header: 'Date',
							render: (audit: any) => (
								<div className="flex items-center space-x-2">
									<CalendarIcon className="h-4 w-4 text-primary" />
									<span>
										{format(new Date(audit.createdAt), 'MMM d, yyyy HH:mm:ss')}
									</span>
								</div>
							),
						},
					]}
					actions={[
						{
							label: 'View Details',
							icon: <EyeIcon className="h-4 w-4" />,
							onClick: (audit: any) => setSelectedAudit(audit),
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					
					keyExtractor={audit => audit.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			</div>

			<Dialog
				open={!!selectedAudit}
				onOpenChange={() => setSelectedAudit(null)}
			>
				<DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Audit Log Details</DialogTitle>
					</DialogHeader>
					{selectedAudit && (
						<div className="grid gap-4">
							<Card>
								<CardHeader>
									<CardTitle>Basic Information</CardTitle>
								</CardHeader>
								<CardContent>
									<dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
										<div>
											<dt className="font-medium text-gray-500">Action</dt>
											<dd className="flex items-center gap-2">
												{getActionIcon(selectedAudit.action)}
												{selectedAudit.action}
											</dd>
										</div>
										<div>
											<dt className="font-medium text-gray-500">Entity Type</dt>
											<dd>{selectedAudit.entityType}</dd>
										</div>
										<div>
											<dt className="font-medium text-gray-500">Entity ID</dt>
											<dd>{selectedAudit.entityId || 'N/A'}</dd>
										</div>
										<div>
											<dt className="font-medium text-gray-500">Date</dt>
											<dd>
												{format(
													new Date(selectedAudit.createdAt),
													'MMM d, yyyy HH:mm:ss',
												)}
											</dd>
										</div>
									</dl>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Context</CardTitle>
								</CardHeader>
								<CardContent>
									<dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
										<div>
											<dt className="font-medium text-gray-500">User</dt>
											<dd>
												{selectedAudit.user ? (
													<div className="flex items-center gap-2">
														<UserIcon className="h-4 w-4 text-primary" />
														{selectedAudit.user.username}
													</div>
												) : (
													'System'
												)}
											</dd>
										</div>
										<div>
											<dt className="font-medium text-gray-500">Tenant</dt>
											<dd>
												{selectedAudit.tenant && (
													<div className="flex items-center gap-2">
														<BuildingIcon className="h-4 w-4 text-primary" />
														{selectedAudit.tenant.name}
													</div>
												)}
											</dd>
										</div>
										<div>
											<dt className="font-medium text-gray-500">IP Address</dt>
											<dd>{selectedAudit.ipAddress || 'N/A'}</dd>
										</div>
										<div>
											<dt className="font-medium text-gray-500">User Agent</dt>
											<dd className="truncate">
												{selectedAudit.userAgent || 'N/A'}
											</dd>
										</div>
									</dl>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Description</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="whitespace-pre-wrap">
										{selectedAudit.description}
									</p>
								</CardContent>
							</Card>

							{selectedAudit.metadata && (
								<Card>
									<CardHeader>
										<CardTitle>Metadata</CardTitle>
									</CardHeader>
									<CardContent>
										<pre className="overflow-x-auto rounded-lg bg-muted p-4">
											{JSON.stringify(selectedAudit.metadata, null, 2)}
										</pre>
									</CardContent>
								</Card>
							)}
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	)
}
