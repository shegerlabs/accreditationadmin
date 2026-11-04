import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Action, AuditAction, AuditEntityType, RequestStatus } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Form, useActionData, useLoaderData, useParams } from '@remix-run/react'
import { Printer } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { Badge } from '~/components/badge'
import {
	DynamicBadge,
	dbTemplateToConfig,
	BadgeElement,
	ParticipantBadgeData,
} from '~/components/badge-designer'
import { InputField } from '~/components/conform/InputField'
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
import {
	getAttachmentFileSrc,
	getParticipantDocumentFileSrc,
	invariantResponse,
} from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { processParticipant } from '~/utils/workflow.server'

export const ParticipantPrintSchema = z.object({
	id: z.string().optional(),
})

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])

	const url = new URL(request.url)
	const paramsSuffix = url.searchParams.size ? '?' + url.searchParams.toString() : ''

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

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

	const { id: participantId } = submission.value

	if (intent === 'not-printed') {
		return redirectWithToast(`/printer/requests/${participantId}${paramsSuffix}`, {
			type: 'message',
			title: 'Badge Not Printed',
			description: `Participant badge not printed.`,
		})
	}

	// Get user's roles for backward compatibility
	const userRoles = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		include: {
			roles: true,
		},
	})

	// Try step-based filtering first (new multi-tenancy approach)
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['printer'])

	// Build where clause: use step-based if available, otherwise fall back to role-based
	const stepFilter =
		accessibleStepIds.length > 0
			? { OR: [{ stepId: { in: accessibleStepIds } }, { status: { in: [RequestStatus.PRINTED, RequestStatus.COLLECTED] }, approvals: { some: { action: Action.PRINT, stepId: { in: accessibleStepIds } } } }] }
			: { step: { roleId: { in: userRoles.roles.map(role => role.id) } } }

	const participant = await prisma.participant.findFirst({
		where: {
			id: participantId,
			...stepFilter,
		},
		select: { id: true },
	})

	invariantResponse(participant, 'Access denied', {
		status: 403,
	})

	const remarks = `Badge Printed`
	await processParticipant(participant.id, user.id, Action.PRINT, remarks)

	await auditRequest({
		request,
		action: AuditAction.PRINT,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participant.id,
		description: 'Participant badge printed',
		userId: user.id,
	})

	return redirectWithToast(`/printer/requests${paramsSuffix}`, {
		type: 'success',
		title: 'Badge Printed',
		description: `Participant badge printed successfully.`,
	})
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	const url = new URL(request.url)
	const baseUrl = `${url.protocol}//${url.host}`

	// Get user's roles for backward compatibility
	const userRoles = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		include: {
			roles: true,
		},
	})

	// Try step-based filtering first (new multi-tenancy approach)
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['printer'])

	// Build where clause: use step-based if available, otherwise fall back to role-based
	const stepFilter =
		accessibleStepIds.length > 0
			? { OR: [{ stepId: { in: accessibleStepIds } }, { status: { in: [RequestStatus.PRINTED, RequestStatus.COLLECTED] }, approvals: { some: { action: Action.PRINT, stepId: { in: accessibleStepIds } } } }] }
			: { step: { roleId: { in: userRoles.roles.map(role => role.id) } } }

	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: {
			id: participantId,
			...stepFilter,
		},
		include: {
			documents: true,
			title: {
				select: {
					name: true,
				},
			},
			country: {
				select: {
					name: true,
				},
			},
			nationality: {
				select: {
					name: true,
				},
			},
			participantType: {
				select: {
					name: true,
				},
			},
			event: {
				select: {
					name: true,
				},
			},
		},
	})

	invariantResponse(participant, 'Access denied', { status: 403 })

	// Find the BADGE template for this participant's event and participant type
	const badgeTemplateRecord = await prisma.template.findFirst({
		where: {
			eventId: participant.eventId,
			participantTypeId: participant.participantTypeId,
			templateType: 'BADGE',
		},
		select: {
			attachments: {
				select: {
					id: true,
					altText: true,
				},
			},
			badgeTemplate: {
				select: {
					id: true,
					name: true,
					width: true,
					height: true,
					borderWidth: true,
					borderColor: true,
					borderRadius: true,
					badgeIdPrefix: true,
					elements: true,
				},
			},
		},
	})

	const generalInfo = {
		id: participant.id,
		tenantId: participant.tenantId,
		eventId: participant.eventId,
		participantTypeId: participant.participantTypeId,
		gender: participant.gender,
		title: participant.title?.name ?? '',
		firstName: participant.firstName,
		familyName: participant.familyName,
		dateOfBirth: participant.dateOfBirth,
		nationality: participant.nationality.name,
		passportNumber: participant.passportNumber,
		passportExpiry: participant.passportExpiry,
		attendClosedSession: participant.attendClosedSession,
		attendExecutiveCouncilClosedSession: participant.attendExecutiveCouncilClosedSession,
		profileUrl: `${baseUrl}/printer/requests/${participant.id}`,
	}

	const professionalInfo = {
		organization: participant.organization,
		jobTitle: participant.jobTitle,
		country: participant.country.name,
		city: participant.city,
		email: participant.email,
		website: participant.website,
		telephone: participant.telephone,
		address: participant.address,
		preferredLanguage: participant.preferredLanguage,
	}

	const photo = participant?.documents.find(doc => doc.documentType === 'PHOTO')

	return json({
		general: generalInfo,
		professional: professionalInfo,
		photo,
		templateAttachments: badgeTemplateRecord?.attachments ?? [],
		badgeTemplate: badgeTemplateRecord?.badgeTemplate ?? null,
		participantTypeName: participant?.participantType.name,
		eventName: participant?.event?.name,
	})
}

export default function PrinterBadgeDialog() {
	const params = useParams()
	const actionData = useActionData<typeof action>()
	const schema = ParticipantPrintSchema
	const [form, fields] = useForm({
		id: 'print-confirmation-form',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			id: params.participantId,
		},
	})
	const {
		general,
		professional,
		photo,
		templateAttachments,
		badgeTemplate,
		participantTypeName,
		eventName,
	} = useLoaderData<typeof loader>()

	const photoLink = getParticipantDocumentFileSrc(photo?.id ?? '')

	// Check if we have a designed badge template with elements
	const hasDesignedBadge =
		badgeTemplate &&
		(badgeTemplate.elements as unknown as BadgeElement[])?.length > 0

	// Prepare participant data for dynamic badge
	const participantBadgeData: ParticipantBadgeData | null = hasDesignedBadge
		? {
				badgeId: `${badgeTemplate.badgeIdPrefix}-${general.id.slice(-6).toUpperCase()}`,
				firstName: general.firstName,
				familyName: general.familyName,
				fullName: `${general.firstName} ${general.familyName}`,
				title: general.title ?? undefined,
				organization: professional.organization ?? undefined,
				jobTitle: professional.jobTitle ?? undefined,
				country: professional.country ?? undefined,
				nationality: general.nationality ?? undefined,
				email: professional.email ?? undefined,
				participantType: participantTypeName ?? undefined,
				eventName: eventName ?? undefined,
				closedSession: general.attendClosedSession,
				executiveCouncilClosedSession: general.attendExecutiveCouncilClosedSession,
				profileUrl: general.profileUrl,
				photoUrl: photoLink,
			}
		: null

	// Get background attachments from the template
	const frontPageTemplate = templateAttachments.find(
		attachment => attachment.altText === 'Front',
	)

	const backPageTemplate = templateAttachments.find(
		attachment => attachment.altText === 'Back',
	)

	const frontPageTemplateLink = getAttachmentFileSrc(
		frontPageTemplate?.id ?? '',
	)
	const backPageTemplateLink = getAttachmentFileSrc(backPageTemplate?.id ?? '')

	return (
		<Dialog
			open={true}
			onOpenChange={() => {
				// Prevent closing via escape or clicking outside
			}}
		>
			<DialogContent
				className="flex h-[90vh] max-w-4xl flex-col"
				hideCloseButton
				onEscapeKeyDown={e => e.preventDefault()}
				onPointerDownOutside={e => e.preventDefault()}
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader className="flex-shrink-0">
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
						<Printer className="h-6 w-6 text-green-600" />
					</div>
					<DialogTitle className="text-center">Print Badge</DialogTitle>
					<DialogDescription className="text-center">
						Preview the badge below and confirm whether you printed it.
					</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 flex-1">
					{hasDesignedBadge && participantBadgeData ? (
						<DynamicBadge
							template={dbTemplateToConfig(badgeTemplate)}
							participant={participantBadgeData}
							frontBackgroundUrl={frontPageTemplateLink}
							backBackgroundUrl={backPageTemplateLink}
							height="100%"
						/>
					) : (
						<Badge
							badgeInfo={{
								id: `SHIRINAB-${general.id}`,
								name: `${general.firstName} ${general.familyName}`,
								organization: professional.organization,
								closedSession: general.attendClosedSession,
								executiveCouncilClosedSession: general.attendExecutiveCouncilClosedSession,
								profileUrl: general.profileUrl,
							}}
							photoUrl={photoLink}
							frontBackgroundUrl={frontPageTemplateLink}
							backBackgroundUrl={backPageTemplateLink}
							height="100%"
						/>
					)}
				</div>

				<DialogFooter className="flex-shrink-0 gap-2 sm:gap-0">
					<Form
						method="POST"
						{...getFormProps(form)}
						className="flex w-full gap-2"
					>
						<AuthenticityTokenInput />
						<HoneypotInputs />
						<InputField meta={fields.id} type="hidden" />

						<Button
							type="submit"
							variant="destructive"
							name="intent"
							value="not-printed"
							className="flex-1"
						>
							Not Printed
						</Button>
						<Button
							type="submit"
							name="intent"
							value="printed"
							className="flex-1"
						>
							Badge Printed
						</Button>
					</Form>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
