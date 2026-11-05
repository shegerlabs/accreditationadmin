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
import { CheckCircle } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
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

export const ParticipantApprovalSchema = z.object({
	id: z.string().optional(),
	stepId: z.string().optional(),
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
		schema: ParticipantApprovalSchema,
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

	const remarks = `Request Approved, sent to next stage for processing`
	await processParticipant(participant.id, user.id, Action.APPROVE, remarks, {
		expectedStepId: submission.value.stepId,
	})

	await auditRequest({
		request,
		action: AuditAction.APPROVE,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participant.id,
		description: `Approved ${participant.firstName} ${participant.familyName} from "${participant.step.name}" to "${nextStep?.name || 'Final'}"`,
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
				stepName: nextStep?.name || 'Final',
				status: 'INPROGRESS',
			},
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
		title: 'Participant Approved',
		description: `Participant successfully approved.`,
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

	invariantResponse(participant, 'Access denied', {
		status: 403,
	})

	return json({ participant })
}

export default function ApproveParticipantDialog() {
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
	const schema = ParticipantApprovalSchema
	const [form, fields] = useForm({
		id: 'participant-approval-form',
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
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
						<CheckCircle className="h-6 w-6 text-green-600" />
					</div>
					<DialogTitle className="text-center">Approve Participant</DialogTitle>
					<DialogDescription className="text-center">
						Are you sure you want to approve this participant? This will move
						them to the next stage in the workflow.
					</DialogDescription>
				</DialogHeader>
				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<InputField meta={fields.id} type="hidden" />
					<InputField meta={fields.stepId} type="hidden" />
					<DialogFooter className="gap-2 sm:gap-0">
						<Button type="button" variant="outline" onClick={handleCancel}>
							Cancel
						</Button>
						<Button type="submit">Approve</Button>
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
						message="You are not authorized to approve participants."
						redirectUrl="/validator/requests"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
