import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import { Form, useActionData, useLoaderData, useNavigate, useParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { ErrorList } from '~/components/forms'
import { Badge } from '~/components/ui/badge'
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/components/ui/table'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

const InvitationDeleteSchema = z.object({
	id: z.string(),
})

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId, invitationId } = params

	const invitation = await prisma.invitation.findUnique({
		where: { id: invitationId },
		include: {
			event: { select: { id: true, name: true } },
			invitationConstraints: {
				include: {
					participantType: { select: { name: true } },
				},
			},
		},
	})

	invariantResponse(invitation, 'Not Found', { status: 404 })
	invariantResponse(invitation.eventId === eventId, 'Not Found', { status: 404 })

	return json({ invitation })
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])
	const { eventId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: InvitationDeleteSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	await prisma.invitation.delete({
		where: { id: submission.value.id },
	})

	await auditRequest({
		request,
		action: AuditAction.DELETE,
		entityType: AuditEntityType.INVITATION,
		entityId: submission.value.id,
		description: 'Invitation deleted',
		userId: user.id,
	})

	return redirectWithToast(`/admin/events/${eventId}/invitations`, {
		type: 'success',
		title: `Invitation Deleted`,
		description: `Invitation deleted successfully.`,
	})
}

export default function DeleteInvitationRoute() {
	const { invitation } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const { eventId } = useParams()
	const navigate = useNavigate()
	const isPending = useIsPending()
	const cancelUrl = `/admin/events/${eventId}/invitations`

	const [form] = useForm({
		id: 'delete-invitation',
		lastResult: actionData?.result,
	})

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			navigate(cancelUrl)
		}
	}

	return (
		<Dialog open onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-[500px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Delete Invitation</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete this invitation? This action cannot be undone.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
						<div>
							<span className="text-muted-foreground">Organization:</span>{' '}
							<span className="font-medium">{invitation.organization}</span>
						</div>
						{invitation.name && (
							<div>
								<span className="text-muted-foreground">Name:</span>{' '}
								<span className="font-medium">{invitation.name}</span>
							</div>
						)}
						<div>
							<span className="text-muted-foreground">Email:</span>{' '}
							<span className="font-medium">{invitation.email}</span>
						</div>
						<div>
							<span className="text-muted-foreground">Max Quota:</span>{' '}
							<span className="font-medium">
								{invitation.maximumQuota ?? 'Unlimited'}
							</span>
						</div>
					</div>

					{invitation.invitationConstraints.length > 0 && (
						<div>
							<p className="text-sm font-medium mb-2">Constraints that will be deleted:</p>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Participant Type</TableHead>
										<TableHead>Access Level</TableHead>
										<TableHead>Quota</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{invitation.invitationConstraints.map(constraint => (
										<TableRow key={constraint.id}>
											<TableCell>{constraint.participantType.name}</TableCell>
											<TableCell>
												<Badge variant="secondary">
													{constraint.accessLevel}
												</Badge>
											</TableCell>
											<TableCell>{constraint.quota ?? 'Unlimited'}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</div>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<input type="hidden" name="id" value={invitation.id} />

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
							Delete Invitation
						</StatusButton>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
