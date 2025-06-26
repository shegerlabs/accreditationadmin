import { Role } from '@prisma/client'
import { LoaderFunctionArgs, SerializeFrom, json } from '@remix-run/node'
import { useLoaderData, useOutletContext, useParams } from '@remix-run/react'
import { UserIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { tenantId, workflowId } = params

	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.step,
		searchFields: [{ role: 'name' }],
		filterFields: ['roleId'],
		where: { tenantId, workflowId },
		orderBy: [{ order: 'asc' }],
		select: {
			id: true,
			name: true,
			action: true,
			nextStepId: true,
			role: {
				select: {
					name: true,
				},
			},
		},
	})

	return json({
		status: 'idle',
		steps: data,
		totalPages,
		currentPage,
	} as const)
}

export default function IndexRoute() {
	const data = useLoaderData<typeof loader>()
	const { roles } = useOutletContext<{ roles: SerializeFrom<Role>[] }>()
	const { totalPages, currentPage } = data
	const isMobile = useMediaQuery({ maxWidth: 767 })
	const { eventId, workflowId } = useParams()

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action={`/admin/events/${eventId}/workflows/${workflowId}/steps`}
						autoSubmit={false}
						filters={[
							{
								name: 'roleId',
								label: 'Role',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...roles.map(role => ({
										value: role.id,
										label: role.name,
									})),
								],
							},
						]}
						extras={[
							{
								label: 'Back',
								to: `/admin/events/${eventId}/workflows`,
								icon: 'chevron-left',
							},
						]}
					/>
				</div>
				<DataList
					data={data.steps}
					columns={[
						{
							key: 'name',
							header: 'Step',
							render: (step: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{step.name}</span>
								</div>
							),
						},
						{
							key: 'action',
							header: 'Action',
							render: (step: any) => step.action,
						},
						{
							key: 'role',
							header: 'Role',
							render: (step: any) => step.role.name,
						},
						{
							key: 'nextStep',
							header: 'Next',
							render: (step: any) => {
								const nextStep = data.steps.find(s => s.id === step.nextStepId)
								if (nextStep) return nextStep.name
								if (step.name === 'Request Received') return 'Review Request'
								if (step.name === 'Review Request') return 'MOFA Approval'
								if (step.name === 'MOFA Approval') return 'NISS Approval'
								if (step.name === 'NISS Approval') return 'MOFA Print'
								if (step.name === 'MOFA Print') return 'Final'
								return 'None'
							},
						},
					]}
					// actions={[
					// 	{
					// 		label: 'Edit',
					// 		icon: <EditIcon className="h-4 w-4" />,
					// 		href: (step: any) => `${step.id}/edit`,
					// 		variant: 'outline' as const,
					// 	},
					// 	{
					// 		label: 'Delete',
					// 		icon: <TrashIcon className="h-4 w-4" />,
					// 		href: (step: any) => `${step.id}/delete`,
					// 		variant: 'outline' as const,
					// 	},
					// ]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={step => step.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
