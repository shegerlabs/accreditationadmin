import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Action, AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import {
	Form,
	useActionData,
	useLoaderData,
	useNavigate,
	useParams,
	useSearchParams,
	useRouteLoaderData,
} from '@remix-run/react'
import { XCircle } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { TextareaField } from '~/components/conform/TextareaField'
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
import { type loader as participantLoader } from './$participantId'

export const ParticipantRejectionSchema = z.object({
	id: z.string().optional(),
	stepId: z.string().optional(),
	reason: z.string({ required_error: 'Reason for rejection is required' }),
})

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, [
		'validator',
		'reviewer',
	])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: ParticipantRejectionSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	// Get step IDs the user has access to via UserEventAccess
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['validator', 'reviewer'])
	const stepFilter = { stepId: { in: accessibleStepIds } }

	const { id: participantId } = submission.value

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
			status: true,
			tenantId: true,
			step: {
				select: {
					id: true,
					name: true,
					workflow: {
						select: {
							id: true,
							name: true,
							event: {
								select: { id: true, name: true },
							},
							steps: {
								where: { isRejectionTarget: true },
								select: { id: true, name: true },
								take: 1,
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

	const rejectionTargetStep = participant.step.workflow.steps[0]

	const remarks = `Request Rejected: ${submission.value.reason}`
	await processParticipant(
		participant.id,
		user.id,
		Action.REJECT,
		remarks,
		{
			participantReason: submission.value.reason,
			expectedStepId: submission.value.stepId,
		},
	)

	await auditRequest({
		request,
		action: AuditAction.REJECT,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participant.id,
		description: `Rejected ${participant.firstName} ${participant.familyName} from "${participant.step.name}" back to "${rejectionTargetStep?.name || 'Start'}"`,
		userId: user.id,
		tenantId: participant.tenantId,
		metadata: {
			beforeState: {
				stepId: participant.step.id,
				stepName: participant.step.name,
				status: participant.status,
			},
			afterState: {
				stepId: rejectionTargetStep?.id,
				stepName: rejectionTargetStep?.name || 'Start',
				status: 'REJECTED',
			},
			rejectionReason: submission.value.reason,
			participant: {
				id: participant.id,
				name: `${participant.firstName} ${participant.familyName}`,
				email: participant.email,
				type: participant.participantType.name,
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
	const searchParams = url.searchParams
	const redirectUrl = `/validator/requests${searchParams.size ? '?' + searchParams.toString() : ''}`

	return redirectWithToast(redirectUrl, {
		type: 'success',
		title: 'Participant Rejected',
		description: `Participant rejected.`,
	})
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, [
		'validator',
		'reviewer',
	])

	// Get step IDs the user has access to via UserEventAccess
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['validator', 'reviewer'])
	const stepFilter = { stepId: { in: accessibleStepIds } }

	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: {
			id: participantId,
			...stepFilter,
		},
		select: {
			id: true,
		},
	})

	invariantResponse(participant, 'Access denied', { status: 403 })

	return json({ participant })
}

export default function RejectParticipantDialog() {
	const { participant } = useLoaderData<typeof loader>()
	// The parent page's loader doesn't rerun when this dialog opens, so this is
	// the step the user actually reviewed.
	const reviewedStepId = useRouteLoaderData<typeof participantLoader>(
		'routes/validator+/requests+/$participantId',
	)?.stepId
	const navigate = useNavigate()
	const params = useParams()
	const [searchParams] = useSearchParams()
	const paramsSuffix = searchParams.size ? '?' + searchParams.toString() : ''
	const actionData = useActionData<typeof action>()
	const schema = ParticipantRejectionSchema
	const [form, fields] = useForm({
		id: 'participant-rejection-form',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			id: participant.id,
			stepId: reviewedStepId,
		},
	})

	const handleCancel = () => {
		navigate(`/validator/requests/${params.participantId}${paramsSuffix}`)
	}

	return (
		<Dialog
			open={true}
			onOpenChange={() => {
				// Prevent closing via escape or clicking outside
			}}
		>
			<DialogContent
				className="sm:max-w-md"
				onEscapeKeyDown={e => e.preventDefault()}
				onPointerDownOutside={e => e.preventDefault()}
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
						<XCircle className="h-6 w-6 text-red-600" />
					</div>
					<DialogTitle className="text-center">Reject Participant</DialogTitle>
					<DialogDescription className="text-center">
						Please provide a reason for rejecting this participant. They will be
						sent back to the requestor.
					</DialogDescription>
				</DialogHeader>
				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<InputField meta={fields.id} type="hidden" />
					<InputField meta={fields.stepId} type="hidden" />
					<div className="py-4">
						<Field>
							<Label htmlFor={fields.reason.id}>Reason for Rejection</Label>
							<TextareaField meta={fields.reason} />
							{fields.reason.errors && (
								<FieldError>{fields.reason.errors}</FieldError>
							)}
						</Field>
					</div>
					<DialogFooter className="gap-2 sm:gap-0">
						<Button type="button" variant="outline" onClick={handleCancel}>
							Cancel
						</Button>
						<Button type="submit" variant="destructive">
							Reject
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
