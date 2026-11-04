import { json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useLocation } from '@remix-run/react'
import { cn } from '~/utils/misc'
import { requireUserWithRoles } from '~/utils/auth.server'
import { getSettingCategories } from '~/utils/settings.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const categories = getSettingCategories()

	return json({ categories })
}

export default function SettingsLayout() {
	const { categories } = useLoaderData<typeof loader>()
	const location = useLocation()

	// Get current category from the URL path
	const pathParts = location.pathname.split('/')
	const currentCategory = pathParts[pathParts.length - 1] || 'auth'

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">System Settings</h1>
				<p className="text-sm text-muted-foreground">
					Configure system-wide settings and defaults
				</p>
			</div>

			<div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
				{categories.map(cat => (
					<Link
						key={cat.id}
						to={`/admin/settings/${cat.id}`}
						className={cn(
							'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
							currentCategory === cat.id
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
						)}
					>
						{cat.label}
					</Link>
				))}
			</div>

			<Outlet />
		</div>
	)
}
