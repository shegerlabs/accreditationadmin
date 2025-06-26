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
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.auditLog,
		searchFields: ['description', 'entityId'],
		filterFields: ['entityType', 'action', 'userId'],
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
			metadata: true,
		},
	})

	const validators = await prisma.user.findMany({
		where: {
			roles: {
				some: {
					name: {
						in: [
							'admin',
							'mofa-validator',
							'mofa-printer',
							'niss-validator',
							'et-broadcast',
							'first-validator',
							'second-validator',
							'printer',
						],
					},
				},
			},
		},
		select: {
			id: true,
			username: true,
		},
	})

	return json({
		status: 'idle',
		audits: data,
		totalPages,
		currentPage,
		validators,
	} as const)
}

export default function AuditsRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage } = data
	const isMobile = useMediaQuery({ maxWidth: 767 })
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
				return <UserIcon className="h-4 w-4 text-purple-500" />
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
									{ value: 'LOGOUT', label: 'Logout' },
									{ value: 'APPROVE', label: 'Approve' },
									{ value: 'REJECT', label: 'Reject' },
									{ value: 'EXPORT', label: 'Export' },
									{ value: 'IMPORT', label: 'Import' },
									{ value: 'PRINT', label: 'Print' },
									{ value: 'BYPASS', label: 'Bypass' },
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
									{ value: 'SYSTEM', label: 'System' },
								],
							},
							{
								name: 'userId',
								label: 'User',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...data.validators.map(user => ({
										value: user.id,
										label: user.username,
									})),
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
					isMobile={isMobile}
					keyExtractor={audit => audit.id}
					totalPages={totalPages}
					currentPage={currentPage}
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
									<dl className="grid grid-cols-2 gap-4">
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
									<dl className="grid grid-cols-2 gap-4">
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
