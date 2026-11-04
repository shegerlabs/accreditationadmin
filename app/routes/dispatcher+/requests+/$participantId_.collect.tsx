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
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { processParticipant } from '~/utils/workflow.server'

export const ParticipantCollectSchema = z.object({
	id: z.string(),
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
		schema: ParticipantCollectSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	// Get step IDs the user has access to via UserEventAccess
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['dispatcher'])
	const stepFilter = { stepId: { in: accessibleStepIds } }

	const { id: participantId, collectedBy, collectedByPhone, collectionNotes } =
		submission.value

	const participant = await prisma.participant.findFirst({
		where: {
			id: participantId,
			...stepFilter,
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

	invariantResponse(participant, 'Access denied', {
		status: 403,
	})

	// Get next step details for audit log
	const nextStep = participant.step.nextStepId
		? await prisma.step.findUnique({
				where: { id: participant.step.nextStepId },
				select: { id: true, name: true },
			})
		: null

	// Update participant with collection info
	await prisma.participant.update({
		where: { id: participantId },
		data: {
			collectedBy,
			collectedByPhone: collectedByPhone || null,
			collectionNotes: collectionNotes || null,
			collectedAt: new Date(),
		},
	})

	const remarks = `Badge collected by ${collectedBy}${collectedByPhone ? ` (${collectedByPhone})` : ''}${collectionNotes ? ` - ${collectionNotes}` : ''}`
	await processParticipant(participant.id, user.id, Action.COLLECT, remarks)

	// Log collect action
	await auditRequest({
		request,
		action: AuditAction.COLLECT,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participant.id,
		description: `Badge collected for ${participant.firstName} ${participant.familyName} by ${collectedBy}`,
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
				collectedAt: new Date().toISOString(),
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

	const url = new URL(request.url)
	const reqSearchParams = url.searchParams
	const redirectUrl = `/dispatcher/requests${reqSearchParams.size ? '?' + reqSearchParams.toString() : ''}`

	return redirectWithToast(redirectUrl, {
		type: 'success',
		title: 'Badge Collected',
		description: `Badge for ${participant.firstName} ${participant.familyName} has been marked as collected by ${collectedBy}.`,
	})
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['dispatcher'])

	// Get step IDs the user has access to via UserEventAccess
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['dispatcher'])
	const stepFilter = { stepId: { in: accessibleStepIds } }

	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: {
			id: participantId,
			...stepFilter,
		},
		select: {
			id: true,
			firstName: true,
			familyName: true,
			organization: true,
			status: true,
			registrationCode: true,
		},
	})

	invariantResponse(participant, 'Access denied', { status: 403 })

	return json({ participant })
}

export default function CollectParticipantDialog() {
	const { participant } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const [searchParams] = useSearchParams()
	const paramsSuffix = searchParams.size ? '?' + searchParams.toString() : ''
	const actionData = useActionData<typeof action>()
	const schema = ParticipantCollectSchema
	const [form, fields] = useForm({
		id: 'participant-collect-form',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			id: participant.id,
			collectedBy: '',
			collectedByPhone: '',
			collectionNotes: '',
		},
	})

	const handleCancel = () => {
		// Navigate back to the list page (dialog closes, list remains)
		navigate(`/dispatcher/requests${paramsSuffix}`)
	}

	return (
		<Dialog
			open={true}
			onOpenChange={() => {
				// Navigate back to list when dialog is closed
				navigate(`/dispatcher/requests${paramsSuffix}`)
			}}
		>
			<DialogContent
				className="sm:max-w-lg"
				onEscapeKeyDown={e => {
					e.preventDefault()
					navigate(`/dispatcher/requests${paramsSuffix}`)
				}}
				onPointerDownOutside={e => e.preventDefault()}
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
						<PackageCheck className="h-6 w-6 text-green-600" />
					</div>
					<DialogTitle className="text-center">Mark Badge as Collected</DialogTitle>
					<DialogDescription className="text-center">
						Please enter the details of the person collecting the badge for{' '}
						<span className="font-semibold">
							{participant.firstName} {participant.familyName}
						</span>{' '}
						({participant.organization})
					</DialogDescription>
				</DialogHeader>
				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<InputField meta={fields.id} type="hidden" />

					<div className="grid gap-4 py-4">
						<Field>
							<Label htmlFor={fields.collectedBy.id}>
								Collected By <span className="text-destructive">*</span>
							</Label>
							<InputField
								meta={fields.collectedBy}
								type="text"
								placeholder="Name of person collecting the badge"
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
							Confirm Collection
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
