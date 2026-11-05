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
	useRouteLoaderData,
} from '@remix-run/react'
import { SkipForward } from 'lucide-react'
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
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { processParticipant } from '~/utils/workflow.server'
import { type loader as participantLoader } from './$participantId'

const BypassSchema = z.object({
	id: z.string(),
	stepId: z.string().optional(),
})

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		select: { id: true },
	})

	invariantResponse(participant, 'Not Found', { status: 404 })

	return json({ participant })
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = parseWithZod(formData, { schema: BypassSchema })

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { id: participantId } = submission.value

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
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
								where: { isBypassTarget: true },
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

	invariantResponse(participant, 'Participant not found', { status: 404 })

	const bypassTargetStep = participant.step.workflow.steps[0]

	await processParticipant(participantId, user.id, Action.BYPASS, undefined, {
		expectedStepId: submission.value.stepId,
	})

	await auditRequest({
		request,
		action: AuditAction.BYPASS,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participantId,
		description: `Admin bypassed ${participant.firstName} ${participant.familyName} from "${participant.step.name}" to "${bypassTargetStep?.name || 'Badge Print'}"`,
		userId: user.id,
		tenantId: participant.tenantId,
		metadata: {
			beforeState: {
				stepId: participant.step.id,
				stepName: participant.step.name,
				status: participant.status,
			},
			afterState: {
				stepId: bypassTargetStep?.id,
				stepName: bypassTargetStep?.name || 'Badge Print',
				status: 'BYPASSED',
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
			bypassedBy: 'administrator',
		},
	})

	return redirectWithToast(`/admin/participants/${participantId}`, {
		type: 'success',
		title: `Participant Bypassed`,
		description: `Participant has been sent to badge printing.`,
	})
}

export default function BypassParticipantDialog() {
	const { participant } = useLoaderData<typeof loader>()
	// The parent page's loader doesn't rerun when this dialog opens, so this is
	// the step the user actually reviewed.
	const reviewedStepId = useRouteLoaderData<typeof participantLoader>(
		'routes/admin+/participants+/$participantId',
	)?.stepId
	const navigate = useNavigate()
	const params = useParams()
	const actionData = useActionData<typeof action>()

	const [form, fields] = useForm({
		id: 'bypass-participant-form',
		constraint: getZodConstraint(BypassSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: BypassSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			id: participant.id,
			stepId: reviewedStepId,
		},
	})

	const handleCancel = () => {
		navigate(`/admin/participants/${params.participantId}`)
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
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
						<SkipForward className="h-6 w-6 text-amber-600" />
					</div>
					<DialogTitle className="text-center">Bypass Participant</DialogTitle>
					<DialogDescription className="text-center">
						Are you sure you want to bypass all remaining approval steps and
						send this participant directly to badge printing?
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
						<Button type="submit" variant="secondary">
							Bypass
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
						message="You are not authorized to bypass participants."
						redirectUrl="/admin/participants"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
