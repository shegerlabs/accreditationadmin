import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useLoaderData,
	useNavigate,
	useParams,
} from '@remix-run/react'
import { Printer } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

import { Action, AuditAction, AuditEntityType } from '@prisma/client'
import { InputField } from '~/components/conform/InputField'
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
import { processParticipant } from '~/utils/workflow.server'

export const ParticipantPrintSchema = z.object({
	id: z.string().optional(),
})

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: ParticipantPrintSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	// Get step IDs the user has access to via UserEventAccess
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['printer'])
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

	const remarks = `Badge Printed`
	await processParticipant(participant.id, user.id, Action.PRINT, remarks)

	// Log print action
	await auditRequest({
		request,
		action: AuditAction.PRINT,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participant.id,
		description: `Printed badge for ${participant.firstName} ${participant.familyName}`,
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
				status: 'PRINTED',
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

	return redirectWithToast(`/printer/requests`, {
		type: 'success',
		title: 'Badge Printed',
		description: `Badge printed successfully.`,
	})
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])

	// Get step IDs the user has access to via UserEventAccess
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['printer'])
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
			registrationCode: true,
		},
	})

	invariantResponse(participant, 'Access denied', { status: 403 })

	return json({ participant })
}

export default function PrintConfirmationDialog() {
	const { participant } = useLoaderData<typeof loader>()
	const navigate = useNavigate()

	const params = useParams()
	const actionData = useActionData<typeof action>()
	const schema = ParticipantPrintSchema
	const [form, fields] = useForm({
		id: 'participant-print-form',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			id: participant.id,
		},
	})

	return (
		<Dialog open onOpenChange={() => navigate(`/printer/requests/${params.participantId}`)}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
						<Printer className="h-6 w-6 text-green-600" />
					</div>
					<DialogTitle className="text-center">Confirm Print</DialogTitle>
					<DialogDescription className="text-center">
						Are you sure you want to mark the badge as printed for{' '}
						<span className="font-medium">
							{participant.firstName} {participant.familyName}
						</span>{' '}
						({participant.registrationCode})?
					</DialogDescription>
				</DialogHeader>

				<DialogFooter className="gap-2 sm:gap-0">
					<Form
						method="POST"
						{...getFormProps(form)}
						className="flex w-full gap-2"
					>
						<AuthenticityTokenInput />
						<HoneypotInputs />
						<InputField meta={fields.id} type="hidden" />

						<Button asChild variant="outline" className="flex-1">
							<Link to={`/printer/requests/${params.participantId}`}>
								Cancel
							</Link>
						</Button>
						<Button type="submit" className="flex-1">
							Confirm Print
						</Button>
					</Form>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
