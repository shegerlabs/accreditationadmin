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

	const { templateId } = params

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.stepTemplate,
		searchFields: [{ role: 'name' }],
		filterFields: ['roleId'],
		where: { workflowTemplateId: templateId },
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

	// Get all steps to map id -> name for nextStepId display
	const allSteps = await prisma.stepTemplate.findMany({
		where: { workflowTemplateId: templateId },
		select: { id: true, name: true },
	})

	const idToName = new Map(allSteps.map(s => [s.id, s.name]))

	const stepsWithNextStep = data.map(step => ({
		...step,
		nextStepName: step.nextStepId !== null ? idToName.get(step.nextStepId) ?? null : null,
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

export default function StepTemplatesListRoute() {
	const data = useLoaderData<typeof loader>()
	const { template } = useOutletContext<{ template: SerializeFrom<WorkflowData> }>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions } = data
	const { tenantId, templateId } = useParams()

	return (
		<div className="w-full">
			<div className="mb-6">
				<SearchBar
					status={data.status}
					action={`/admin/tenants/${tenantId}/workflow-templates/${templateId}/steps`}
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
							to: `/admin/tenants/${tenantId}/workflow-templates`,
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
						render: (step: any) => step.nextStepName ?? 'None',
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
