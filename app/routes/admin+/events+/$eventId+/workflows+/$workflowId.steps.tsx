import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, NavLink, Outlet, useLoaderData } from '@remix-run/react'
import { GitBranch, List, Users } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { cn } from '~/utils/misc'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { workflowId } = params

	const workflow = await prisma.workflow.findUnique({
		where: { id: workflowId },
		select: {
			id: true,
			name: true,
			tenantId: true,
			eventId: true,
		},
	})

	return json({ workflow })
}

export default function StepsLayout() {
	const { workflow } = useLoaderData<typeof loader>()

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				{/* View Toggle Tabs */}
				<div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
					<NavLink
						to="."
						end
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
				</div>
				<Button asChild size="sm" variant="outline">
					<Link to="move" relative="path">
						<Users className="mr-1 h-4 w-4" />
						Move participants
					</Link>
				</Button>
			</div>

			{/* Child routes render here */}
			<Outlet context={{ workflow }} />
		</div>
	)
}
