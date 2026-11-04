import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Action } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import {
	Form,
	useActionData,
	useLoaderData,
	useNavigate,
	useParams,
} from '@remix-run/react'
import { Undo2 } from 'lucide-react'
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
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

const UndoBypassSchema = z.object({
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
	await requireUserWithRoles(request, ['admin', 'tenant'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = parseWithZod(formData, { schema: UndoBypassSchema })

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
			step: {
				select: {
					id: true,
					name: true,
					workflowId: true,
				},
			},
		},
	})

	invariantResponse(participant, 'Participant not found', { status: 404 })

	// Find the most recent bypass approval to determine which step the participant was on before
	const lastBypassApproval = await prisma.approval.findFirst({
		where: {
			participantId,
			action: Action.BYPASS,
		},
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			stepId: true,
			step: { select: { id: true, name: true } },
		},
	})

	if (!lastBypassApproval) {
		return json(
			{
				result: submission.reply({
					formErrors: ['Could not find the bypass record to undo'],
				}),
			},
			{ status: 400 },
		)
	}

	const previousStepId = lastBypassApproval.stepId
	const previousStepName = lastBypassApproval.step.name

	await prisma.participant.update({
		where: { id: participantId },
		data: {
			stepId: previousStepId,
			status: 'INPROGRESS',
		},
	})

	// Remove the bypass approval record so history looks as if it never happened
	await prisma.approval.delete({
		where: { id: lastBypassApproval.id },
	})

	return redirectWithToast(`/admin/participants/${participantId}`, {
		type: 'success',
		title: `Bypass Undone`,
		description: `Participant has been moved back to "${previousStepName}".`,
	})
}

export default function UndoBypassParticipantDialog() {
	const { participant } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const params = useParams()
	const actionData = useActionData<typeof action>()

	const [form, fields] = useForm({
		id: 'undo-bypass-participant-form',
		constraint: getZodConstraint(UndoBypassSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: UndoBypassSchema })
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
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
						<Undo2 className="h-6 w-6 text-orange-600" />
					</div>
					<DialogTitle className="text-center">Undo Bypass</DialogTitle>
					<DialogDescription className="text-center">
						Are you sure you want to undo the bypass? The participant will be
						moved back to the step they were on before the bypass.
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
						<Button type="submit">Undo Bypass</Button>
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
						message="You are not authorized to undo bypasses."
						redirectUrl="/admin/participants"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
