import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useLocation } from '@remix-run/react'
import {
	CalendarDays,
	CheckCircle,
	CircleDot,
	Edit,
	FileImage,
	FileText,
	Mail,
	Workflow,
} from 'lucide-react'
import { ActionForm } from '~/components/action-form'
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
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

type EventActionArgs = {
	request: Request
	eventId: string
	formData: FormData
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		where: { id: eventId },
		include: {
			meetings: {
				include: {
					meetingType: true,
				},
			},
			restrictions: true,
			workflows: true,
			invitations: true,
			templates: true,
		},
	})

	invariantResponse(event, 'Not Found', { status: 404 })

	return json({ event })
}

const publishEventActionIntent = 'publish'
const closeEventActionIntent = 'close'
const reopenEventActionIntent = 'reopen'

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const { eventId } = params
	invariantResponse(eventId, 'Event ID not found', { status: 404 })

	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const intent = formData.get('intent')
	switch (intent) {
		case publishEventActionIntent: {
			return publishEventAction({ request, eventId, formData })
		}
		case closeEventActionIntent: {
			return closeEventAction({ request, eventId, formData })
		}
		case reopenEventActionIntent: {
			return reopenEventAction({ request, eventId, formData })
		}
		default: {
			throw new Response(`Invalid intent "${intent}"`, { status: 400 })
		}
	}
}

async function publishEventAction({ eventId }: EventActionArgs) {
	await prisma.event.update({
		where: { id: eventId },
		data: { status: 'PUBLISHED' },
	})

	return json({ status: 'success' } as const)
}

async function closeEventAction({ eventId }: EventActionArgs) {
	await prisma.event.update({
		where: { id: eventId },
		data: { status: 'COMPLETED' },
	})

	return json({ status: 'success' } as const)
}

async function reopenEventAction({ eventId }: EventActionArgs) {
	await prisma.event.update({
		where: { id: eventId },
		data: { status: 'PUBLISHED' },
	})

	return json({ status: 'success' } as const)
}

export default function EventDetailsRoute() {
	const { event } = useLoaderData<typeof loader>()
	const location = useLocation()

	const tabs = [
		{ name: 'Overview', path: '.', icon: CalendarDays },
		{ name: 'Meetings', path: 'meetings', icon: CalendarDays },
		{ name: 'Restrictions', path: 'restrictions', icon: FileText },
		{ name: 'Workflows', path: 'workflows', icon: Workflow },
		{ name: 'Invitations', path: 'invitations', icon: Mail },
		{ name: 'Templates', path: 'templates', icon: FileImage },
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
								{event.name}
							</CardTitle>
							{event.status === 'DRAFT' && (
								<CircleDot className="h-4 w-4 text-orange-500" />
							)}
							{event.status === 'PUBLISHED' && (
								<CheckCircle className="h-4 w-4 text-green-500" />
							)}
							{event.status === 'COMPLETED' && (
								<CheckCircle className="h-4 w-4 text-red-500" />
							)}
						</div>

						<div className="flex items-center space-x-2">
							{event.status === 'DRAFT' && (
								<ActionForm
									method="POST"
									data={{
										eventId: event?.id,
									}}
									buttonContent={'Publish Event'}
									buttonVariant="default"
									buttonSize="sm"
									showContentOnDoubleCheck={false}
									intent="publish"
								/>
							)}

							{event.status === 'PUBLISHED' && (
								<ActionForm
									method="POST"
									data={{
										eventId: event?.id,
									}}
									buttonContent={'Close Event'}
									buttonVariant="destructive"
									buttonSize="sm"
									showContentOnDoubleCheck={false}
									intent="close"
								/>
							)}

							{event.status === 'COMPLETED' && (
								<ActionForm
									method="POST"
									data={{
										eventId: event?.id,
									}}
									buttonContent={'Reopen Event'}
									buttonVariant="outline"
									buttonSize="sm"
									showContentOnDoubleCheck={false}
									intent="reopen"
								/>
							)}

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
						{event.description}
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
