import { Role } from '@prisma/client'
import { LoaderFunctionArgs, SerializeFrom, json } from '@remix-run/node'
import { useLoaderData, useOutletContext, useParams } from '@remix-run/react'
import { EditIcon, TrashIcon, UserIcon } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { WorkflowData } from '~/components/workflow-builder/types'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { workflowId } = params

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.step,
		searchFields: [{ role: 'name' }],
		filterFields: ['roleId'],
		where: { workflowId },
		orderBy: [{ order: 'asc' }],
		select: {
			id: true,
			name: true,
			action: true,
			order: true,
			nextStepId: true,
			roleId: true,
			role: {
				select: {
					id: true,
					name: true,
				},
			},
		},
	})

	// Fetch next step names for all steps that have nextStepId
	const nextStepIds = data
		.map(step => step.nextStepId)
		.filter((id): id is string => id !== null)

	const nextSteps = nextStepIds.length > 0
		? await prisma.step.findMany({
				where: { id: { in: nextStepIds } },
				select: { id: true, name: true },
			})
		: []

	const nextStepMap = new Map(nextSteps.map(s => [s.id, s.name]))

	const stepsWithNextStep = data.map(step => ({
		...step,
		nextStep: step.nextStepId ? { name: nextStepMap.get(step.nextStepId) ?? null } : null,
	}))

	const roles = await prisma.role.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})

	return json({
		status: 'idle',
		steps: stepsWithNextStep,
		roles,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
	} as const)
}

export default function StepsListRoute() {
	const data = useLoaderData<typeof loader>()
	const { workflow } = useOutletContext<{ workflow: SerializeFrom<WorkflowData> }>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions } = data
	const { eventId, workflowId } = useParams()

	return (
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
								{ value: 'all', label: 'Clear' },
								...data.roles.map(role => ({
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
						key: 'order',
						header: 'Order',
						render: (step: any) => step.order,
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
						header: 'Next Step',
						render: (step: any) => step.nextStep?.name ?? 'None',
					},
				]}
				actions={[
					{
						label: 'Edit',
						icon: <EditIcon className="h-4 w-4" />,
						href: (step: any) => `${step.id}/edit`,
						variant: 'outline' as const,
					},
					{
						label: 'Delete',
						icon: <TrashIcon className="h-4 w-4" />,
						href: (step: any) => `${step.id}/delete`,
						variant: 'outline' as const,
					},
				]}
				status={data.status}
				
				keyExtractor={(step: any) => step.id}
				totalPages={totalPages}
				currentPage={currentPage}
				defaultPageSize={defaultPageSize}
				pageSizeOptions={pageSizeOptions}
			/>
		</div>
	)
}
