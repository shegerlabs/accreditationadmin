import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Action, AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import {
	Form,
	useActionData,
	useLoaderData,
	useNavigate,
	useSearchParams,
} from '@remix-run/react'
import { PackageCheck } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { TextareaField } from '~/components/conform/TextareaField'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Label } from '~/components/ui/label'
import { auditRequest } from '~/utils/audit.server'
import {
	getUserAccessibleStepIds,
	requireUserWithRoles,
} from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import { processParticipant } from '~/utils/workflow.server'

export const BulkCollectSchema = z.object({
	participantIds: z
		.string()
		.min(1, 'At least one participant must be selected'),
	collectedBy: z
		.string({ required_error: 'Name of person collecting is required' })
		.min(2, 'Name must be at least 2 characters'),
	collectedByPhone: z.string().optional(),
	collectionNotes: z.string().optional(),
})

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['dispatcher'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: BulkCollectSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { participantIds, collectedBy, collectedByPhone, collectionNotes } =
		submission.value

	const ids = participantIds.split(',').filter(Boolean)

	// Get step IDs the user has access to via UserEventAccess
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['dispatcher'])

	// Verify all participants belong to accessible steps and have PRINTED status
	const participants = await prisma.participant.findMany({
		where: {
			id: { in: ids },
			stepId: { in: accessibleStepIds },
			status: 'PRINTED',
		},
		select: {
			id: true,
			firstName: true,
			familyName: true,
			email: true,
			organization: true,
			status: true,
			tenantId: true,
			step: {
				select: {
					id: true,
					name: true,
					nextStepId: true,
					workflow: {
						select: {
							id: true,
							name: true,
							event: {
								select: { id: true, name: true },
							},
						},
					},
				},
			},
			participantType: {
				select: { id: true, name: true },
			},
		},
	})

	if (participants.length === 0) {
		return json(
			{
				result: submission.reply({
					formErrors: ['No valid participants found for collection'],
				}),
			},
			{ status: 400 },
		)
	}

	// Process each participant
	const collectedAt = new Date()
	const remarks = `Badge collected by ${collectedBy}${collectedByPhone ? ` (${collectedByPhone})` : ''}${collectionNotes ? ` - ${collectionNotes}` : ''}`

	for (const participant of participants) {
		// Update participant with collection info
		await prisma.participant.update({
			where: { id: participant.id },
			data: {
				collectedBy,
				collectedByPhone: collectedByPhone || null,
				collectionNotes: collectionNotes || null,
				collectedAt,
			},
		})

		// Process workflow
		await processParticipant(participant.id, user.id, Action.COLLECT, remarks)

		// Get next step details for audit log
		const nextStep = participant.step.nextStepId
			? await prisma.step.findUnique({
					where: { id: participant.step.nextStepId },
					select: { id: true, name: true },
				})
			: null

		// Audit log
		await auditRequest({
			request,
			action: AuditAction.COLLECT,
			entityType: AuditEntityType.PARTICIPANT,
			entityId: participant.id,
			description: `Badge collected for ${participant.firstName} ${participant.familyName} by ${collectedBy} (bulk collection)`,
			userId: user.id,
			tenantId: participant.tenantId,
			metadata: {
				beforeState: {
					stepId: participant.step.id,
					stepName: participant.step.name,
					status: participant.status,
				},
				afterState: {
					stepId: nextStep?.id,
					stepName: nextStep?.name || 'Completed',
					status: 'COLLECTED',
				},
				participant: {
					id: participant.id,
					name: `${participant.firstName} ${participant.familyName}`,
					email: participant.email,
					organization: participant.organization,
					type: participant.participantType.name,
				},
				collection: {
					collectedBy,
					collectedByPhone,
					collectionNotes,
					collectedAt: collectedAt.toISOString(),
					bulkCollection: true,
				},
				event: {
					id: participant.step.workflow.event.id,
					name: participant.step.workflow.event.name,
				},
				workflow: {
					id: participant.step.workflow.id,
					name: participant.step.workflow.name,
				},
			},
		})
	}

	const url = new URL(request.url)
	const reqSearchParams = new URLSearchParams(url.searchParams)
	reqSearchParams.delete('selected')
	const redirectUrl = `/dispatcher/requests${reqSearchParams.size ? '?' + reqSearchParams.toString() : ''}`

	return redirectWithToast(redirectUrl, {
		type: 'success',
		title: 'Badges Collected',
		description: `${participants.length} badge(s) marked as collected by ${collectedBy}.`,
	})
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['dispatcher'])

	const url = new URL(request.url)
	const selectedIds = url.searchParams.get('selected')?.split(',').filter(Boolean) || []

	if (selectedIds.length === 0) {
		throw new Response('No participants selected', { status: 400 })
	}

	// Get step IDs the user has access to via UserEventAccess
	const user = await requireUserWithRoles(request, ['dispatcher'])
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['dispatcher'])

	// Get participant details for display
	const participants = await prisma.participant.findMany({
		where: {
			id: { in: selectedIds },
			stepId: { in: accessibleStepIds },
			status: 'PRINTED',
		},
		select: {
			id: true,
			firstName: true,
			familyName: true,
			organization: true,
		},
	})

	return json({ participants, selectedIds: participants.map(p => p.id) })
}

export default function BulkCollectDialog() {
	const { participants, selectedIds } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const actionData = useActionData<typeof action>()
	const [searchParams] = useSearchParams()

	const schema = BulkCollectSchema
	const [form, fields] = useForm({
		id: 'bulk-collect-form',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			participantIds: selectedIds.join(','),
			collectedBy: '',
			collectedByPhone: '',
			collectionNotes: '',
		},
	})

	const handleCancel = () => {
		// Navigate back to list, preserving other search params but removing selection
		const newParams = new URLSearchParams(searchParams)
		newParams.delete('selected')
		navigate(`/dispatcher/requests?${newParams.toString()}`)
	}

	// Get unique organizations for display
	const organizations = [...new Set(participants.map(p => p.organization))]

	return (
		<Dialog
			open={true}
			onOpenChange={() => {
				handleCancel()
			}}
		>
			<DialogContent
				className="sm:max-w-lg"
				onEscapeKeyDown={e => {
					e.preventDefault()
					handleCancel()
				}}
				onPointerDownOutside={e => e.preventDefault()}
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
						<PackageCheck className="h-6 w-6 text-green-600" />
					</div>
					<DialogTitle className="text-center">
						Bulk Badge Collection
					</DialogTitle>
					<DialogDescription className="text-center">
						You are about to mark <span className="font-semibold">{participants.length} badge(s)</span> as collected
						{organizations.length === 1 && (
							<> from <span className="font-semibold">{organizations[0]}</span></>
						)}
						{organizations.length > 1 && (
							<> from <span className="font-semibold">{organizations.length} organizations</span></>
						)}
						. Please enter the details of the person collecting these badges.
					</DialogDescription>
				</DialogHeader>
				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<InputField meta={fields.participantIds} type="hidden" />

					<div className="grid gap-4 py-4">
						<Field>
							<Label htmlFor={fields.collectedBy.id}>
								Collected By <span className="text-destructive">*</span>
							</Label>
							<InputField
								meta={fields.collectedBy}
								type="text"
								placeholder="Name of person collecting the badges"
								autoFocus
							/>
							{fields.collectedBy.errors && (
								<FieldError>{fields.collectedBy.errors}</FieldError>
							)}
						</Field>

						<Field>
							<Label htmlFor={fields.collectedByPhone.id}>Phone Number</Label>
							<InputField
								meta={fields.collectedByPhone}
								type="tel"
								placeholder="Contact phone number (optional)"
							/>
							{fields.collectedByPhone.errors && (
								<FieldError>{fields.collectedByPhone.errors}</FieldError>
							)}
						</Field>

						<Field>
							<Label htmlFor={fields.collectionNotes.id}>Notes</Label>
							<TextareaField
								meta={fields.collectionNotes}
								placeholder="Any additional notes about the collection (optional)"
								rows={3}
							/>
							{fields.collectionNotes.errors && (
								<FieldError>{fields.collectionNotes.errors}</FieldError>
							)}
						</Field>
					</div>

					<DialogFooter className="gap-2 sm:gap-0">
						<Button type="button" variant="outline" onClick={handleCancel}>
							Cancel
						</Button>
						<Button type="submit">
							<PackageCheck className="mr-2 h-4 w-4" />
							Confirm Collection ({participants.length})
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				400: () => (
					<ErrorDisplay
						title="No Selection"
						message="Please select at least one badge to collect."
						redirectUrl="/dispatcher/requests"
						errorCode={400}
					/>
				),
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You are not authorized to collect badges."
						redirectUrl="/dispatcher/requests"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
