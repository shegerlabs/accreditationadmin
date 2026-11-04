import { LoaderFunctionArgs, json } from '@remix-run/node'
import { NavLink, Outlet, useLoaderData } from '@remix-run/react'
import { GitBranch, List } from 'lucide-react'
import { cn } from '~/utils/misc'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { templateId } = params

	const template = await prisma.workflowTemplate.findUnique({
		where: { id: templateId },
		select: {
			id: true,
			name: true,
			tenantId: true,
		},
	})

	const roles = await prisma.role.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})

	return json({ template, roles })
}

export default function StepsLayout() {
	const { template, roles } = useLoaderData<typeof loader>()

	return (
		<div className="flex flex-col gap-4">
			{/* View Toggle Tabs */}
			<div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
				<NavLink
					to="visual"
					className={({ isActive }) =>
						cn(
							'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
							isActive
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground',
						)
					}
				>
					<GitBranch className="h-4 w-4" />
					Visual
				</NavLink>
				<NavLink
					to="list"
					className={({ isActive }) =>
						cn(
							'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
							isActive
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground',
						)
					}
				>
					<List className="h-4 w-4" />
					List
				</NavLink>
			</div>

			{/* Child routes render here */}
			<Outlet context={{ template, roles }} />
		</div>
	)
}
