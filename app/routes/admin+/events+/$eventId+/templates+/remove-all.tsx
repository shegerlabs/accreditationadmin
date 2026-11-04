import { getFormProps, useForm } from '@conform-to/react'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import { Form, useActionData, useLoaderData, useNavigate, useParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { StatusButton } from '~/components/ui/status-button'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { ErrorList } from '~/components/forms'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		select: { id: true, name: true },
		where: { id: eventId },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	const templateCount = await prisma.template.count({
		where: { eventId },
	})

	return json({ event, templateCount })
}

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	// Delete all templates for this event (attachments will cascade delete)
	const result = await prisma.template.deleteMany({
		where: { eventId },
	})

	return redirectWithToast(`/admin/events/${eventId}/templates`, {
		type: 'success',
		title: 'Templates Removed',
		description: `Successfully removed ${result.count} template${result.count !== 1 ? 's' : ''}.`,
	})
}

export default function RemoveAllTemplatesRoute() {
	const { event, templateCount } = useLoaderData<typeof loader>()
	const actionData = useActionData<{ result: any }>()
	const { eventId } = useParams()
	const navigate = useNavigate()
	const isPending = useIsPending()
	const cancelUrl = `/admin/events/${eventId}/templates`

	const [form] = useForm({
		id: 'remove-all-templates',
		lastResult: actionData?.result,
	})

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			navigate(cancelUrl)
		}
	}

	if (templateCount === 0) {
		return (
			<Dialog open onOpenChange={handleOpenChange}>
				<DialogContent
					className="sm:max-w-[425px]"
					onInteractOutside={e => e.preventDefault()}
				>
					<DialogHeader>
						<DialogTitle>Remove All Templates</DialogTitle>
						<DialogDescription>
							There are no templates to remove for this event.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" asChild>
							<a href={cancelUrl}>Close</a>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		)
	}

	return (
		<Dialog open onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-[425px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Remove All Templates</DialogTitle>
					<DialogDescription>
						Are you sure you want to remove all {templateCount} template
						{templateCount !== 1 ? 's' : ''} from "{event.name}"? This will also
						delete all attachments associated with them. This action cannot be undone.
					</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<ErrorList id={form.errorId} errors={form.errors} />

					<DialogFooter>
						<Button type="button" variant="outline" asChild>
							<a href={cancelUrl}>Cancel</a>
						</Button>
						<StatusButton
							type="submit"
							name="intent"
							value="delete"
							variant="destructive"
							disabled={isPending}
							status={isPending ? 'pending' : form.status ?? 'idle'}
						>
							Remove {templateCount} Template{templateCount !== 1 ? 's' : ''}
						</StatusButton>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
