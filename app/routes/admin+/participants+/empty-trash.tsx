import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useLoaderData,
	useNavigation,
} from '@remix-run/react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { auditRequest } from '~/utils/audit.server'
import { requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { deleteDirectory } from '~/utils/storage.server'
import { redirectWithToast } from '~/utils/toast.server'

const CONFIRMATION_WORD = 'DELETE'
const TRASH_URL = '/admin/participants?deleted=deleted'
// Participants whose files are removed from blob storage at the same time
const STORAGE_DELETE_BATCH = 5

const inTrash = { deletedAt: { not: null } }

async function requireGlobalAdmin(request: Request) {
	const user = await requireAdminAccess(request)
	invariantResponse(
		user.isGlobalAdmin,
		'Only global administrators can empty the recycle bin',
		{ status: 403 },
	)
	return user
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireGlobalAdmin(request)

	const [participantCount, documentCount, approvalCount, byEvent] =
		await Promise.all([
			prisma.participant.count({ where: inTrash }),
			prisma.participantDocument.count({ where: { participant: inTrash } }),
			prisma.approval.count({ where: { participant: inTrash } }),
			prisma.participant.groupBy({
				by: ['eventId'],
				where: inTrash,
				_count: { id: true },
			}),
		])

	const events = await prisma.event.findMany({
		where: { id: { in: byEvent.map(group => group.eventId) } },
		select: { id: true, name: true },
	})
	const eventName = new Map(events.map(event => [event.id, event.name]))

	return json({
		participantCount,
		documentCount,
		approvalCount,
		byEvent: byEvent
			.map(group => ({
				eventId: group.eventId,
				name: eventName.get(group.eventId) ?? 'Unknown event',
				count: group._count.id,
			}))
			.sort((a, b) => b.count - a.count),
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireGlobalAdmin(request)

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	if (formData.get('confirm') !== CONFIRMATION_WORD) {
		return json(
			{ error: `Type ${CONFIRMATION_WORD} to confirm` },
			{ status: 400 },
		)
	}

	const trashed = await prisma.participant.findMany({
		where: inTrash,
		select: {
			id: true,
			firstName: true,
			familyName: true,
			registrationCode: true,
		},
	})

	if (trashed.length === 0) {
		return redirectWithToast(TRASH_URL, {
			type: 'message',
			title: 'Recycle Bin Is Empty',
			description: 'There were no deleted participants to remove.',
		})
	}

	// The deletedAt guard skips anyone restored since the list was read.
	// Documents, approvals and email logs cascade with the participant.
	await prisma.participant.deleteMany({
		where: { id: { in: trashed.map(p => p.id) }, ...inTrash },
	})

	// Only remove files for participants that are actually gone, so a
	// participant restored in the meantime keeps their documents.
	const survivors = new Set(
		(
			await prisma.participant.findMany({
				where: { id: { in: trashed.map(p => p.id) } },
				select: { id: true },
			})
		).map(p => p.id),
	)
	const deleted = trashed.filter(p => !survivors.has(p.id))

	const storageFailures: string[] = []
	for (let i = 0; i < deleted.length; i += STORAGE_DELETE_BATCH) {
		await Promise.all(
			deleted.slice(i, i + STORAGE_DELETE_BATCH).map(async participant => {
				try {
					await deleteDirectory({
						containerName: 'accreditation',
						directoryName: `participants/${participant.id}`,
					})
				} catch (error) {
					console.error(
						`Failed to delete files for participant ${participant.id}:`,
						error,
					)
					storageFailures.push(participant.id)
				}
			}),
		)
	}

	await auditRequest({
		request,
		action: AuditAction.DELETE,
		entityType: AuditEntityType.PARTICIPANT,
		description: `Recycle bin emptied: ${deleted.length} participant(s) permanently deleted`,
		userId: user.id,
		metadata: {
			participants: deleted.map(p => ({
				id: p.id,
				registrationCode: p.registrationCode,
				name: `${p.firstName} ${p.familyName}`,
			})),
			storageFailures,
		},
	})

	return redirectWithToast(TRASH_URL, {
		type: 'success',
		title: 'Recycle Bin Emptied',
		description:
			`${deleted.length} participant(s) and all their data were permanently deleted.` +
			(storageFailures.length
				? ` Files for ${storageFailures.length} could not be removed from storage; see the audit log.`
				: ''),
	})
}

export default function EmptyTrashRoute() {
	const { participantCount, documentCount, approvalCount, byEvent } =
		useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const [confirmation, setConfirmation] = useState('')
	const isSubmitting = navigation.state !== 'idle'

	if (participantCount === 0) {
		return (
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between gap-4">
						<div>
							<CardTitle>Recycle Bin Is Empty</CardTitle>
							<CardDescription>
								There are no deleted participants to remove.
							</CardDescription>
						</div>
						<Button variant="outline" asChild>
							<Link to={TRASH_URL}>
								<ArrowLeft className="mr-2 h-4 w-4" />
								Back
							</Link>
						</Button>
					</div>
				</CardHeader>
			</Card>
		)
	}

	return (
		<Card className="border-destructive">
			<CardHeader>
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="rounded-full bg-destructive/20 p-2">
							<Trash2 className="h-6 w-6 text-destructive" />
						</div>
						<div>
							<CardTitle className="text-destructive">
								Empty Recycle Bin
							</CardTitle>
							<CardDescription>
								<strong>This cannot be undone.</strong> Every deleted
								participant is removed for good, with their documents, approval
								history and emails.
							</CardDescription>
						</div>
					</div>
					<Button variant="outline" asChild>
						<Link to={TRASH_URL}>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Cancel
						</Link>
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				<dl className="grid grid-cols-3 gap-4 rounded-lg border p-4">
					<div>
						<dt className="text-xs text-muted-foreground">Participants</dt>
						<dd className="text-2xl font-semibold tabular-nums">
							{participantCount}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">Documents</dt>
						<dd className="text-2xl font-semibold tabular-nums">
							{documentCount}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">Approval records</dt>
						<dd className="text-2xl font-semibold tabular-nums">
							{approvalCount}
						</dd>
					</div>
				</dl>

				<div>
					<h3 className="mb-2 text-sm font-medium">By event</h3>
					<ul className="divide-y rounded-lg border text-sm">
						{byEvent.map(event => (
							<li
								key={event.eventId}
								className="flex justify-between px-4 py-2"
							>
								<span>{event.name}</span>
								<span className="tabular-nums text-muted-foreground">
									{event.count}
								</span>
							</li>
						))}
					</ul>
				</div>

				<Form method="POST" className="space-y-3">
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<div className="space-y-1.5">
						<Label htmlFor="confirm">
							Type <span className="font-mono">{CONFIRMATION_WORD}</span> to
							confirm
						</Label>
						<Input
							id="confirm"
							name="confirm"
							autoComplete="off"
							spellCheck={false}
							value={confirmation}
							onChange={event => setConfirmation(event.target.value)}
							className="max-w-xs"
							aria-invalid={actionData?.error ? true : undefined}
							aria-describedby={actionData?.error ? 'confirm-error' : undefined}
						/>
						{actionData?.error && (
							<p id="confirm-error" className="text-sm text-destructive">
								{actionData.error}
							</p>
						)}
					</div>
					<Button
						type="submit"
						variant="destructive"
						disabled={confirmation !== CONFIRMATION_WORD || isSubmitting}
					>
						<Trash2 className="mr-2 h-4 w-4" />
						{isSubmitting
							? 'Deleting…'
							: `Permanently Delete ${participantCount} Participant(s)`}
					</Button>
				</Form>
			</CardContent>
		</Card>
	)
}
