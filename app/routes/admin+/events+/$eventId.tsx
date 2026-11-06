import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useLocation } from '@remix-run/react'
import {
	ArrowLeft,
	CalendarDays,
	CheckCircle,
	CircleDot,
	Edit,
	FileImage,
	FileText,
	Globe,
	ListChecks,
	Lock,
	Plus,
	TriangleAlert,
	Mail,
	MailCheck,
	RefreshCw,
	Trash2,
	Users,
	Workflow,
} from 'lucide-react'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { unfinishedEventTypes } from '~/utils/add-participant-type.server'
import { requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
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

	// Prevent accessing deleted events from the main details page
	if (event.deletedAt) {
		throw json({ message: 'This event has been deleted' }, { status: 410 })
	}

	// Tenant admins can only access their own tenant's events
	if (!currentUser.isGlobalAdmin && event.tenantId !== currentUser.tenantId) {
		throw json({ message: 'Access denied' }, { status: 403 })
	}
	const types = await unfinishedEventTypes(event.id)
	return json({ event, types })
}

/** More unfinished types than this are summarised as "N more", linking to the picker. */
const BANNER_LIMIT = 5

export default function EventDetailsRoute() {
	const { event, types } = useLoaderData<typeof loader>()
	const location = useLocation()
	const canChangeSetup = event.status !== 'COMPLETED'

	const tabs = [
		{ name: 'Overview', path: '.', icon: CalendarDays },
		{ name: 'Restrictions', path: 'restrictions', icon: FileText },
		{ name: 'Workflows', path: 'workflows', icon: Workflow },
		{ name: 'Invitations', path: 'invitations', icon: Mail },
		{ name: 'Templates', path: 'templates', icon: FileImage },
		{ name: 'Emails', path: 'emails', icon: MailCheck },
		{ name: 'Access', path: 'access', icon: Users },
	]

	const currentTab =
		tabs.find(tab => location.pathname.includes(`/${tab.path}`)) || tabs[0]

	const statusConfig = {
		DRAFT: {
			icon: CircleDot,
			title: 'Draft',
			variant: 'warning' as const,
		},
		PUBLISHED: {
			icon: CheckCircle,
			title: 'Published',
			variant: 'success' as const,
		},
		COMPLETED: {
			icon: Lock,
			title: 'Closed',
			variant: 'muted' as const,
		},
	}

	const status = statusConfig[event.status as keyof typeof statusConfig]
	const StatusIcon = status.icon

	return (
		<div>
			{/* Dynamic Status Alert with Event Info and Actions */}
			<Alert variant={status.variant} className="mb-6">
				<StatusIcon className="h-5 w-5" />
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<AlertTitle className="text-xl font-semibold">
						{event.name} - {status.title}
					</AlertTitle>
					<div className="flex items-center gap-2">
						{event.status === 'DRAFT' && (
							<Button asChild size="sm">
								<Link to="publish">
									<Globe className="mr-2 h-4 w-4" />
									Publish
								</Link>
							</Button>
						)}

						{event.status === 'PUBLISHED' && (
							<Button asChild variant="destructive" size="sm">
								<Link to="close">
									<Lock className="mr-2 h-4 w-4" />
									Close
								</Link>
							</Button>
						)}

						{event.status === 'COMPLETED' && (
							<Button asChild size="sm">
								<Link to="reopen">
									<RefreshCw className="mr-2 h-4 w-4" />
									Reopen
								</Link>
							</Button>
						)}

						{canChangeSetup && (
							<Button asChild variant="outline" size="sm">
								<Link to={`/admin/events/${event.id}/setup`}>
									<ListChecks className="mr-2 h-4 w-4" />
									{event.status === 'DRAFT' && types.hasList
										? 'Edit setup'
										: 'Set up'}
								</Link>
							</Button>
						)}

						{canChangeSetup && types.hasList && (
							<Button asChild variant="outline" size="sm">
								<Link to={`/admin/events/${event.id}/add-type`}>
									<Plus className="mr-2 h-4 w-4" />
									Add type
								</Link>
							</Button>
						)}

						<Button asChild variant="outline" size="icon">
							<Link to="edit" aria-label="Edit event">
								<Edit className="h-4 w-4" />
							</Link>
						</Button>
						{event.status === 'DRAFT' && (
							<Button asChild variant="outline" size="icon">
								<Link to="delete" aria-label="Delete event">
									<Trash2 className="h-4 w-4" />
								</Link>
							</Button>
						)}
						<Button asChild variant="outline" size="icon">
							<Link to="/admin/events" aria-label="Back to events">
								<ArrowLeft className="h-4 w-4" />
							</Link>
						</Button>
					</div>
				</div>
			</Alert>

			{canChangeSetup && types.unfinished.length > 0 && (
				<Alert variant="warning" className="mb-6">
					<TriangleAlert className="h-5 w-5" />
					<AlertTitle>
						{types.unfinished.length === 1
							? '1 participant type isn\u2019t fully set up'
							: `${types.unfinished.length} participant types aren\u2019t fully set up`}
					</AlertTitle>
					<AlertDescription className="flex flex-col gap-2">
						<p>
							The portal only offers a type once it has a workflow, and its
							badges can&rsquo;t print without a badge template.
						</p>
						<ul className="flex flex-wrap gap-x-4 gap-y-1">
							{types.unfinished.slice(0, BANNER_LIMIT).map(t => (
								<li key={t.id}>
									<Link
										to={`/admin/events/${event.id}/add-type?type=${t.id}`}
										className="font-medium underline underline-offset-2 hover:no-underline"
									>
										Set up {t.name}
									</Link>{' '}
									<span className="text-xs">
										(no{' '}
										{t.missing
											.map(m => (m === 'badge' ? 'badge template' : m))
											.join(' or ')}
										)
									</span>
								</li>
							))}
							{types.unfinished.length > BANNER_LIMIT && (
								<li>
									<Link
										to={`/admin/events/${event.id}/add-type`}
										className="font-medium underline underline-offset-2 hover:no-underline"
									>
										{types.unfinished.length - BANNER_LIMIT} more
									</Link>
								</li>
							)}
						</ul>
					</AlertDescription>
				</Alert>
			)}

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

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => (
					<ErrorDisplay
						title="Event Not Found"
						message="The event you're looking for does not exist."
						redirectUrl="/admin/events"
						errorCode={404}
					/>
				),
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You don't have permission to access this event."
						redirectUrl="/admin/events"
						errorCode={403}
					/>
				),
				410: () => (
					<ErrorDisplay
						title="Event Deleted"
						message="This event has been deleted. You can restore it from the deleted events list."
						redirectUrl="/admin/events/deleted"
						errorCode={410}
					/>
				),
			}}
		/>
	)
}
