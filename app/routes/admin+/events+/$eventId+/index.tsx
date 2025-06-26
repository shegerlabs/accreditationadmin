import { json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import {
	ArrowRight,
	Calendar,
	FileImage,
	FileText,
	Mail,
	Workflow,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			name: true,
			description: true,
			status: true,
			startDate: true,
			endDate: true,
			_count: {
				select: {
					meetings: true,
					restrictions: true,
					workflows: true,
					invitations: true,
					templates: true,
				},
			},
		},
	})

	if (!event) {
		throw new Response('Not Found', { status: 404 })
	}

	return json({ event })
}

export default function EventOverviewRoute() {
	const { event } = useLoaderData<typeof loader>()

	const overviewItems = [
		{
			title: 'Meetings',
			count: event._count.meetings,
			icon: Calendar,
			path: 'meetings',
		},
		{
			title: 'Restrictions',
			count: event._count.restrictions,
			icon: FileText,
			path: 'restrictions',
		},
		{
			title: 'Workflows',
			count: event._count.workflows,
			icon: Workflow,
			path: 'workflows',
		},
		{
			title: 'Invitations',
			count: event._count.invitations,
			icon: Mail,
			path: 'invitations',
		},
		{
			title: 'Templates',
			count: event._count.templates,
			icon: FileImage,
			path: 'templates',
		},
	]

	const totalItems = overviewItems.reduce((sum, item) => sum + item.count, 0)
	const daysUntilEvent = Math.ceil(
		(new Date(event.startDate).getTime() - new Date().getTime()) /
			(1000 * 3600 * 24),
	)

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Event Overview</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						<Card>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">Status</CardTitle>
								<div
									className={`h-2 w-2 rounded-full ${event.status === 'PUBLISHED' ? 'bg-green-500' : event.status === 'COMPLETED' ? 'bg-red-500' : event.status === 'DRAFT' ? 'bg-orange-500' : 'bg-gray-500'}`}
								/>
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{event.status}</div>
								<p className="text-xs text-muted-foreground">
									Current event status
								</p>
							</CardContent>
						</Card>
						<Card>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">
									Days Until Event
								</CardTitle>
								<Calendar className="h-4 w-4 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{daysUntilEvent}</div>
								<p className="text-xs text-muted-foreground">
									Starting {new Date(event.startDate).toLocaleDateString()}
								</p>
							</CardContent>
						</Card>
						<Card>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">
									Event Duration
								</CardTitle>
								<Calendar className="h-4 w-4 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">
									{Math.ceil(
										(new Date(event.endDate).getTime() -
											new Date(event.startDate).getTime()) /
											(1000 * 3600 * 24),
									)}{' '}
									days
								</div>
								<p className="text-xs text-muted-foreground">
									From {new Date(event.startDate).toLocaleDateString()} to{' '}
									{new Date(event.endDate).toLocaleDateString()}
								</p>
							</CardContent>
						</Card>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Event Components</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{overviewItems.map(item => (
							<Link key={item.title} to={item.path} className="block">
								<Card className="transition-shadow hover:shadow-md">
									<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
										<CardTitle className="text-sm font-medium">
											{item.title}
										</CardTitle>
										<item.icon className="h-4 w-4 text-muted-foreground" />
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold">{item.count}</div>
										<div className="mt-2 flex items-center text-sm text-muted-foreground">
											View details
											<ArrowRight className="ml-1 h-4 w-4" />
										</div>
									</CardContent>
								</Card>
							</Link>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
