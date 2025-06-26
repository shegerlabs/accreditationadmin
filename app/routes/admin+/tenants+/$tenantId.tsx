import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useLocation } from '@remix-run/react'
import { Building2, CalendarDays, Edit, FileText, MapPin } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { tenantId } = params

	const tenant = await prisma.tenant.findUnique({
		where: { id: tenantId },
		include: {
			meetingTypes: true,
			participantTypes: true,
			venues: true,
		},
	})

	invariantResponse(tenant, 'Not Found', { status: 404 })

	return json({ tenant })
}

export default function TenantDetailsRoute() {
	const { tenant } = useLoaderData<typeof loader>()
	const location = useLocation()

	const tabs = [
		{ name: 'Overview', path: '.', icon: Building2 },
		{ name: 'Meeting Types', path: 'meeting-types', icon: CalendarDays },
		{ name: 'Participant Types', path: 'participant-types', icon: FileText },
		{ name: 'Venues', path: 'venues', icon: MapPin },
	]

	const currentTab =
		tabs.find(tab => location.pathname.includes(`/${tab.path}`)) || tabs[0]

	return (
		<div className="container mx-auto px-1">
			<Card className="mb-6">
				<CardHeader className="pb-2">
					<div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
						<div className="flex items-center space-x-2">
							<CardTitle className="text-2xl md:text-3xl">
								{tenant.name}
							</CardTitle>
						</div>
						<div className="flex items-center space-x-2">
							<Button asChild variant="outline" size="icon">
								<Link to="edit" aria-label="Edit event">
									<Edit className="h-4 w-4" />
								</Link>
							</Button>
							{/* <Button asChild variant="outline" size="icon">
								<Link to="delete" aria-label="Delete event">
									<Trash2 className="h-4 w-4" />
								</Link>
							</Button> */}
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<CardDescription className="text-sm md:text-base">
						{tenant.email} ({tenant.phone})
					</CardDescription>
				</CardContent>
			</Card>

			<div className="flex flex-col gap-4 sm:gap-6">
				<Tabs value={currentTab.path} className="w-full">
					<ScrollArea className="w-full">
						<TabsList className="inline-flex h-12 w-full items-center justify-between overflow-x-auto rounded-none border-b-0 bg-transparent p-0 text-muted-foreground sm:h-14">
							{tabs.map(tab => (
								<TabsTrigger
									key={tab.path}
									value={tab.path}
									asChild
									className="relative inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-none border-b border-r border-t border-border px-2 py-2 text-xs font-medium ring-offset-background transition-all after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 first:border-l hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-b-transparent data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:after:scale-x-100 sm:px-4 sm:text-sm"
								>
									<Link
										to={tab.path}
										className="flex w-full items-center justify-center space-x-1 sm:space-x-2"
									>
										<tab.icon className="h-4 w-4 sm:h-5 sm:w-5" />
										<span className="hidden sm:inline">{tab.name}</span>
									</Link>
								</TabsTrigger>
							))}
						</TabsList>
					</ScrollArea>
				</Tabs>

				<Outlet />
			</div>
		</div>
	)
}
