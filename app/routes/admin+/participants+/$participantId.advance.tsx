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
} from '@remix-run/react'
import { ArrowRight } from 'lucide-react'
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

const AdvanceSchema = z.object({
	id: z.string(),
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

	const submission = parseWithZod(formData, { schema: AdvanceSchema })

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

	invariantResponse(participant, 'Participant not found', { status: 404 })

	if (!participant.step.nextStepId) {
		return json(
			{
				result: submission.reply({
					formErrors: ['No next step configured for this workflow stage'],
				}),
			},
			{ status: 400 },
		)
	}

	const nextStepInfo = await prisma.step.findUnique({
		where: { id: participant.step.nextStepId },
		select: { id: true, name: true },
	})

	await processParticipant(
		participantId,
		user.id,
		Action.APPROVE,
		'Advanced by administrator',
	)

	await auditRequest({
		request,
		action: AuditAction.UPDATE,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participantId,
		description: `Admin advanced ${participant.firstName} ${participant.familyName} from "${participant.step.name}" to "${nextStepInfo?.name || 'Next Step'}"`,
		userId: user.id,
		tenantId: participant.tenantId,
		metadata: {
			beforeState: {
				stepId: participant.step.id,
				stepName: participant.step.name,
				status: participant.status,
			},
			afterState: {
				stepId: nextStepInfo?.id,
				stepName: nextStepInfo?.name || 'Next Step',
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
			advancedBy: 'administrator',
		},
	})

	return redirectWithToast(`/admin/participants/${participantId}`, {
		type: 'success',
		title: `Participant Advanced`,
		description: `Participant has been moved to "${nextStepInfo?.name || 'next step'}".`,
	})
}

export default function AdvanceParticipantDialog() {
	const { participant } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const params = useParams()
	const actionData = useActionData<typeof action>()

	const [form, fields] = useForm({
		id: 'advance-participant-form',
		constraint: getZodConstraint(AdvanceSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: AdvanceSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			id: participant.id,
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
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
						<ArrowRight className="h-6 w-6 text-blue-600" />
					</div>
					<DialogTitle className="text-center">Advance Participant</DialogTitle>
					<DialogDescription className="text-center">
						Are you sure you want to advance this participant to the next step
						in the workflow?
					</DialogDescription>
				</DialogHeader>
				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<InputField meta={fields.id} type="hidden" />
					<DialogFooter className="gap-2 sm:gap-0">
						<Button type="button" variant="outline" onClick={handleCancel}>
							Cancel
						</Button>
						<Button type="submit">Advance</Button>
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
						message="You are not authorized to advance participants."
						redirectUrl="/admin/participants"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
