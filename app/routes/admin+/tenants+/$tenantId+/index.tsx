import { json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import {
	ArrowRight,
	Calendar,
	CreditCard,
	FileText,
	GitBranch,
	MapPin,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const { tenantId } = params

	// Tenant admins can only access their own tenant
	if (!currentUser.isGlobalAdmin && tenantId !== currentUser.tenantId) {
		throw json({ message: 'Access denied' }, { status: 403 })
	}

	const tenant = await prisma.tenant.findUnique({
		where: { id: tenantId },
		select: {
			name: true,
			email: true,
			participantTypes: true,
			meetingTypes: true,
			venues: true,
			workflowTemplates: true,
			badgeTemplates: true,
		},
	})

	if (!tenant) {
		throw new Response('Not Found', { status: 404 })
	}

	return json({ tenant })
}

export default function TenantDetailsRoute() {
	const { tenant } = useLoaderData<typeof loader>()

	const overviewItems = [
		{
			title: 'Meeting Types',
			count: tenant.meetingTypes.length,
			icon: Calendar,
			path: 'meeting-types',
		},
		{
			title: 'Participant Types',
			count: tenant.participantTypes.length,
			icon: FileText,
			path: 'participant-types',
		},
		{
			title: 'Venues',
			count: tenant.venues.length,
			icon: MapPin,
			path: 'venues',
		},
		{
			title: 'Workflows',
			count: tenant.workflowTemplates.length,
			icon: GitBranch,
			path: 'workflow-templates',
		},
		{
			title: 'Badges',
			count: tenant.badgeTemplates.length,
			icon: CreditCard,
			path: 'badge-templates',
		},
	]

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Tenant Details</CardTitle>
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
