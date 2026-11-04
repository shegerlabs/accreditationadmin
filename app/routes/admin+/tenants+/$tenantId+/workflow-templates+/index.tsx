import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData, useParams } from '@remix-run/react'
import { EditIcon, List, TrashIcon, Workflow } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { tenantId } = params

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.workflowTemplate,
		searchFields: ['name', 'description'],
		where: { tenantId },
		orderBy: [{ createdAt: 'desc' }],
		include: {
			_count: {
				select: { steps: true },
			},
		},
	})

	return json({
		status: 'idle',
		templates: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
	} as const)
}

export default function WorkflowTemplatesIndexRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions } = data
	const { tenantId } = useParams()

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action={`/admin/tenants/${tenantId}/workflow-templates`}
						autoSubmit={false}
					/>
				</div>
				<DataList
					data={data.templates}
					columns={[
						{
							key: 'name',
							header: 'Template Name',
							render: (template: any) => (
								<Link to={`/admin/tenants/${tenantId}/workflow-templates/${template.id}/steps/visual`} className="flex items-center space-x-2">
									<Workflow className="h-4 w-4 text-primary" />
									<span>{template.name}</span>
								</Link>
							),
						},
						{
							key: 'description',
							header: 'Description',
							render: (template: any) => (
								<span className="text-muted-foreground">
									{template.description || '-'}
								</span>
							),
						},
						{
							key: 'steps',
							header: 'Steps',
							render: (template: any) => (
								<span>{template._count?.steps || 0} steps</span>
							),
						},
					]}
					actions={[
						{
							label: 'Steps',
							icon: <List className="h-4 w-4" />,
							href: (template: any) => `${template.id}/steps`,
							variant: 'outline' as const,
						},
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
					
					keyExtractor={template => template.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			</div>
		</div>
	)
}
