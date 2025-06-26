import { ParticipantType } from '@prisma/client'
import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData, useOutletContext, useParams } from '@remix-run/react'
import { List, UserIcon } from 'lucide-react'
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
		model: prisma.workflow,
		searchFields: ['name', { participantType: 'name' }],
		filterFields: ['participantTypeId'],
		where: { eventId },
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			name: true,
			participantType: {
				select: {
					name: true,
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
		},
	})

	return json({
		status: 'idle',
		workflows: data,
		totalPages,
		currentPage,
	} as const)
}

export default function IndexRoute() {
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
						action={`/admin/events/${eventId}/workflows`}
						autoSubmit={false}
						filters={[
							{
								name: 'participantTypeId',
								label: 'Participant Type',
								type: 'select',
								options: [
									{ value: 'all', label: 'Clear' },
									...participantTypes.map(participantType => ({
										value: participantType.id,
										label: participantType.name,
									})),
								],
							},
						]}
					/>
				</div>
				<DataList
					data={data.workflows}
					columns={[
						{
							key: 'name',
							header: 'Workflow',
							render: (workflow: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{workflow.name}</span>
								</div>
							),
						},
						{
							key: 'participantType',
							header: 'Participant Type',
							render: (workflow: any) => (
								<span>{workflow.participantType.name}</span>
							),
						},
					]}
					actions={[
						{
							label: 'Steps',
							icon: <List className="h-4 w-4" />,
							href: (workflow: any) => `${workflow.id}/steps`,
							variant: 'outline' as const,
						},
						// {
						// 	label: 'Edit',
						// 	icon: <EditIcon className="h-4 w-4" />,
						// 	href: (workflow: any) => `${workflow.id}/edit`,
						// 	variant: 'outline' as const,
						// },
						// {
						// 	label: 'Delete',
						// 	icon: <TrashIcon className="h-4 w-4" />,
						// 	href: (workflow: any) => `${workflow.id}/delete`,
						// 	variant: 'outline' as const,
						// },
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={workflow => workflow.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
