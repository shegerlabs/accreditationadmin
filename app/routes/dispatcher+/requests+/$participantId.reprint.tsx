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
import { RefreshCw } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { TextareaField } from '~/components/conform/TextareaField'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { Field, FieldError } from '~/components/forms'
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
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { redirectWithToast } from '~/utils/toast.server'

export const ReprintRequestSchema = z.object({
	id: z.string(),
	reason: z
		.string({ required_error: 'Reason for reprint is required' })
		.min(10, 'Please provide a detailed reason (at least 10 characters)'),
})

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['dispatcher'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: ReprintRequestSchema,
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

	const { id: participantId, reason } = submission.value

	// Get reprint settings
	const maxReprints = await getSetting<number>(SettingKeys.REPRINT_MAX_COUNT)

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
			reprintCount: true,
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

	// Check reprint limit
	if (participant.reprintCount >= maxReprints) {
		return json(
			{
				result: submission.reply({
					formErrors: [`Reprint limit reached. Maximum ${maxReprints} reprints allowed.`],
				}),
			},
			{ status: 400 },
		)
	}

	// Check if there's already a pending reprint request
	const pendingRequest = await prisma.approval.findFirst({
		where: {
			participantId: participant.id,
			action: 'REPRINT',
			result: 'SUCCESS',
		},
		orderBy: { createdAt: 'desc' },
	})

	if (pendingRequest) {
		// Check if it was fulfilled
		const fulfilledPrint = await prisma.approval.findFirst({
			where: {
				participantId: participant.id,
				action: 'PRINT',
				createdAt: { gt: pendingRequest.createdAt },
			},
		})

		if (!fulfilledPrint) {
			return json(
				{
					result: submission.reply({
						formErrors: [
							'There is already a pending reprint request for this participant.',
						],
					}),
				},
				{ status: 400 },
			)
		}
	}

	// Create the reprint request approval record
	await prisma.approval.create({
		data: {
			participantId: participant.id,
			stepId: participant.step.id,
			userId: user.id,
			action: Action.REPRINT,
			result: 'SUCCESS',
			remarks: `Reprint requested: ${reason}`,
		},
	})

	// Log reprint request action
	await auditRequest({
		request,
		action: AuditAction.REPRINT,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participant.id,
		description: `Reprint requested for ${participant.firstName} ${participant.familyName}`,
		userId: user.id,
		tenantId: participant.tenantId,
		metadata: {
			participant: {
				id: participant.id,
				name: `${participant.firstName} ${participant.familyName}`,
				email: participant.email,
				organization: participant.organization,
				type: participant.participantType.name,
			},
			reprintRequest: {
				reason,
				currentReprintCount: participant.reprintCount,
				requestedBy: user.id,
				requestedAt: new Date().toISOString(),
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
		title: 'Reprint Requested',
		description: `Reprint request submitted for ${participant.firstName} ${participant.familyName}. The printer will be notified.`,
	})
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['dispatcher'])

	// Get step IDs the user has access to via UserEventAccess
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['dispatcher'])
	const stepFilter = { stepId: { in: accessibleStepIds } }

	const { participantId } = params

	// Get reprint settings
	const maxReprints = await getSetting<number>(SettingKeys.REPRINT_MAX_COUNT)

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
			reprintCount: true,
		},
	})

	invariantResponse(participant, 'Access denied', { status: 403 })

	// Check if already at limit
	if (participant.reprintCount >= maxReprints) {
		throw new Response('Reprint limit reached', { status: 400 })
	}

	return json({ participant, maxReprints })
}

export default function ReprintRequestDialog() {
	const { participant, maxReprints } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const [searchParams] = useSearchParams()
	const paramsSuffix = searchParams.size ? '?' + searchParams.toString() : ''
	const actionData = useActionData<typeof action>()
	const schema = ReprintRequestSchema
	const [form, fields] = useForm({
		id: 'reprint-request-form',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			id: participant.id,
			reason: '',
		},
	})

	const handleCancel = () => {
		navigate(`/dispatcher/requests/${participant.id}${paramsSuffix}`)
	}

	const remainingReprints = maxReprints - participant.reprintCount

	return (
		<Dialog
			open={true}
			onOpenChange={() => {
				navigate(`/dispatcher/requests/${participant.id}${paramsSuffix}`)
			}}
		>
			<DialogContent
				className="sm:max-w-lg"
				onEscapeKeyDown={e => {
					e.preventDefault()
					navigate(`/dispatcher/requests/${participant.id}${paramsSuffix}`)
				}}
				onPointerDownOutside={e => e.preventDefault()}
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
						<RefreshCw className="h-6 w-6 text-amber-600" />
					</div>
					<DialogTitle className="text-center">Request Badge Reprint</DialogTitle>
					<DialogDescription className="text-center">
						Request a reprint for{' '}
						<span className="font-semibold">
							{participant.firstName} {participant.familyName}
						</span>{' '}
						({participant.registrationCode})
					</DialogDescription>
				</DialogHeader>

				<div className="flex justify-center">
					<Badge
						variant="outline"
						className={
							remainingReprints <= 1
								? 'border-red-300 bg-red-50 text-red-700'
								: 'border-amber-300 bg-amber-50 text-amber-700'
						}
					>
						{remainingReprints} reprint{remainingReprints !== 1 ? 's' : ''} remaining
					</Badge>
				</div>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<InputField meta={fields.id} type="hidden" />

					<div className="grid gap-4 py-4">
						<Field>
							<Label htmlFor={fields.reason.id}>
								Reason for Reprint <span className="text-destructive">*</span>
							</Label>
							<TextareaField
								meta={fields.reason}
								placeholder="Please explain why a reprint is needed (e.g., badge lost, damaged, misprinted...)"
								rows={4}
								autoFocus
							/>
							{fields.reason.errors && (
								<FieldError>{fields.reason.errors}</FieldError>
							)}
						</Field>
					</div>

					{form.errors && form.errors.length > 0 && (
						<div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
							{form.errors.map((error, i) => (
								<p key={i}>{error}</p>
							))}
						</div>
					)}

					<DialogFooter className="gap-2 sm:gap-0">
						<Button type="button" variant="outline" onClick={handleCancel}>
							Cancel
						</Button>
						<Button type="submit" className="bg-amber-600 hover:bg-amber-700">
							<RefreshCw className="mr-2 h-4 w-4" />
							Submit Request
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
						title="Reprint Limit Reached"
						message="This participant has reached the maximum number of reprints allowed."
						redirectUrl="/dispatcher/requests"
						errorCode={400}
					/>
				),
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You are not authorized to request reprints."
						redirectUrl="/dispatcher/requests"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
