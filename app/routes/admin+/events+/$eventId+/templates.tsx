import { BadgeTemplate, ParticipantType } from '@prisma/client'
import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useLocation, useParams } from '@remix-run/react'
import { EditIcon, TrashIcon, UserIcon } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: { id: true, tenantId: true },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.template,
		searchFields: ['name'],
		filterFields: ['templateType', 'participantTypeId'],
		where: { eventId },
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			name: true,
			description: true,
			templateType: true,
			participantType: {
				select: {
					name: true,
				},
			},
		},
	})

	const participantTypes = await prisma.participantType.findMany({
		where: { tenantId: event.tenantId, name: { not: 'Any' } },
		select: {
			id: true,
			name: true,
		},
		orderBy: { name: 'asc' },
	})

	const badgeTemplates = await prisma.badgeTemplate.findMany({
		where: { tenantId: event.tenantId },
		select: {
			id: true,
			name: true,
			width: true,
			height: true,
			borderWidth: true,
			borderColor: true,
			borderRadius: true,
			badgeIdPrefix: true,
			elements: true,
			isDefault: true,
		},
	})

	return json({
		status: 'idle',
		templates: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		participantTypes,
		badgeTemplates,
	} as const)
}

export default function TemplatesRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions, participantTypes, badgeTemplates } = data
	const { eventId } = useParams()
	const location = useLocation()

	// Check if there's a default badge template
	const hasDefaultBadgeTemplate = badgeTemplates.some(bt => bt.isDefault)

	return (
		<>
			<div className="flex flex-col gap-8">
				<div className="w-full">
					<div className="mb-6">
						<SearchBar
							status={data.status}
							action={`/admin/events/${eventId}/templates`}
							autoSubmit={false}
							filters={[
								{
									name: 'participantTypeId',
									label: 'Participant Type',
									type: 'select',
									options: [
										{ value: 'all', label: 'All' },
										...participantTypes.map(participantType => ({
											value: participantType.id,
											label: participantType.name,
										})),
									],
								},
								{
									name: 'templateType',
									label: 'Template Type',
									type: 'select',
									options: [
										{ value: 'all', label: 'All' },
										{ value: 'BADGE', label: 'BADGE' },
										{ value: 'FLYER', label: 'FLYER' },
										{ value: 'BANNER', label: 'BANNER' },
										{ value: 'LOGO', label: 'LOGO' },
									],
								},
							]}
							extras={[
								{
									type: 'dropdown',
									label: 'More',
									items: [
										...(hasDefaultBadgeTemplate
											? [{ label: 'Bulk Create', to: 'bulk-create', icon: 'layers' as const }]
											: []),
										{ label: 'Remove All', to: 'remove-all', icon: 'cross-1' as const },
									],
								},
							]}
						/>
					</div>
					<DataList
						data={data.templates}
						columns={[
							{
								key: 'name',
								header: 'Template',
								render: (template: any) => (
									<Link to={`/admin/events/${eventId}/templates/${template.id}/edit`} className="flex items-center space-x-2">
										<UserIcon className="h-4 w-4 text-primary" />
										<span>{template.name}</span>
									</Link>
								),
							},
							{
								key: 'participantType',
								header: 'Participant Type',
								render: (template: any) => template.participantType.name,
							},
							{
								key: 'templateType',
								header: 'Template Type',
								render: (template: any) => template.templateType,
							},
						]}
						actions={[
							{
								label: 'Edit',
								icon: <EditIcon className="h-4 w-4" />,
								href: (template: any) =>
									`/admin/events/${eventId}/templates/${template.id}/edit`,
								variant: 'outline' as const,
							},
							{
								label: 'Delete',
								icon: <TrashIcon className="h-4 w-4" />,
								href: (template: any) =>
									`/admin/events/${eventId}/templates/${template.id}/delete`,
								variant: 'outline' as const,
							},
						]}
						status={data.status}
						
						keyExtractor={template => template.id}
						totalPages={totalPages}
						currentPage={currentPage}
						defaultPageSize={defaultPageSize}
						pageSizeOptions={pageSizeOptions}
					/>
				</div>
			</div>
			<Outlet context={{ participantTypes, badgeTemplates }} />
		</>
	)
}
