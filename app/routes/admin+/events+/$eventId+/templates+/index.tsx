import { ParticipantType } from '@prisma/client'
import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData, useOutletContext, useParams } from '@remix-run/react'
import { EditIcon, TrashIcon, UserIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId } = params

	const { data, totalPages, currentPage } = await filterAndPaginate({
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

	return json({
		status: 'idle',
		templates: data,
		totalPages,
		currentPage,
	} as const)
}

export default function TemplatesListPage() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage } = data
	const { participantTypes } = useOutletContext<{
		participantTypes: ParticipantType[]
	}>()

	const isMobile = useMediaQuery({ maxWidth: 767 })
	const { eventId } = useParams()

	return (
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
					/>
				</div>
				<DataList
					data={data.templates}
					columns={[
						{
							key: 'name',
							header: 'Template',
							render: (template: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{template.name}</span>
								</div>
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
							href: (template: any) => `${template.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (template: any) => `${template.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={template => template.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
