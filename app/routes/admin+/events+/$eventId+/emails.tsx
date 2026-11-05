import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, Outlet, useLoaderData } from '@remix-run/react'
import { EditIcon } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { EMAIL_TEMPLATE_DEFAULTS, EMAIL_TRIGGERS } from '~/utils/participant-email'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const event = await prisma.event.findUnique({
		where: { id: params.eventId },
		select: { id: true, tenantId: true },
	})
	invariantResponse(event, 'Not Found', { status: 404 })
	await requireAdminAccess(request, event.tenantId)

	const customTemplates = await prisma.emailTemplate.findMany({
		where: { eventId: event.id },
		select: { trigger: true, enabled: true, updatedAt: true },
	})

	const templates = EMAIL_TRIGGERS.map(trigger => {
		const custom = customTemplates.find(t => t.trigger === trigger)
		const definition = EMAIL_TEMPLATE_DEFAULTS[trigger]
		return {
			trigger,
			label: definition.label,
			description: definition.description,
			isCustom: Boolean(custom),
			enabled: custom ? custom.enabled : definition.enabled,
		}
	})

	return json({ templates })
}

export default function EventEmailsRoute() {
	const { templates } = useLoaderData<typeof loader>()

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Participant emails</CardTitle>
					<p className="text-sm text-muted-foreground">
						Each email goes to the participant and to the focal point who
						registered them. Emails that are not customized use the default
						wording.
					</p>
				</CardHeader>
				<CardContent className="divide-y p-0">
					{templates.map(template => (
						<div
							key={template.trigger}
							className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-medium">{template.label}</span>
									<Badge variant={template.enabled ? 'default' : 'secondary'}>
										{template.enabled ? 'On' : 'Off'}
									</Badge>
									<Badge variant="outline">
										{template.isCustom ? 'Customized' : 'Default wording'}
									</Badge>
								</div>
								<p className="mt-1 text-sm text-muted-foreground">
									{template.description}
								</p>
							</div>
							<Button asChild variant="outline" size="sm" className="shrink-0">
								<Link to={template.trigger}>
									<EditIcon className="mr-2 h-4 w-4" />
									Edit
								</Link>
							</Button>
						</div>
					))}
				</CardContent>
			</Card>
			<Outlet />
		</div>
	)
}
