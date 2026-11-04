import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData, useParams } from '@remix-run/react'
import { CreditCard, EditIcon, TrashIcon, Star, Palette } from 'lucide-react'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Badge } from '~/components/ui/badge'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { tenantId } = params

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.badgeTemplate,
		searchFields: ['name', 'description', 'badgeIdPrefix'],
		where: { tenantId },
		orderBy: [{ createdAt: 'desc' }],
		include: {
			_count: {
				select: { templates: true },
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

export default function BadgeTemplatesIndexRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions } = data
	const { tenantId } = useParams()

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action={`/admin/tenants/${tenantId}/badge-templates`}
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
								<Link to={`/admin/tenants/${tenantId}/badge-templates/${template.id}`} className="flex items-center space-x-2">
									<CreditCard className="h-4 w-4 text-primary" />
									<span>{template.name}</span>
									{template.isDefault && (
										<Badge variant="secondary" className="ml-2">
											<Star className="mr-1 h-3 w-3" />
											Default
										</Badge>
									)}
								</Link>
							),
						},
						{
							key: 'dimensions',
							header: 'Dimensions',
							render: (template: any) => {
								const widthInches = (template.width / 72).toFixed(2)
								const heightInches = (template.height / 72).toFixed(2)
								return (
									<span className="text-muted-foreground">
										{widthInches}" × {heightInches}" ({template.width} × {template.height} pt)
									</span>
								)
							},
						},
						{
							key: 'badgeIdPrefix',
							header: 'Badge Prefix',
							render: (template: any) => (
								<code className="rounded bg-muted px-2 py-1 text-sm">
									{template.badgeIdPrefix}
								</code>
							),
						},
						{
							key: 'usage',
							header: 'Used By',
							render: (template: any) => (
								<span>{template._count?.templates || 0} event templates</span>
							),
						},
					]}
					actions={[
						{
							label: 'Design',
							icon: <Palette className="h-4 w-4" />,
							href: (template: any) => `${template.id}`,
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
