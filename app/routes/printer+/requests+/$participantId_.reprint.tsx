import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Action, AuditAction, AuditEntityType, RequestStatus } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Form, useActionData, useLoaderData, useNavigate, useParams } from '@remix-run/react'
import { Printer, RefreshCw } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { Badge as BadgeComponent } from '~/components/badge'
import {
	DynamicBadge,
	dbTemplateToConfig,
	BadgeElement,
	ParticipantBadgeData,
} from '~/components/badge-designer'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
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
import { auditRequest } from '~/utils/audit.server'
import { badgeQrUrl } from '~/utils/badge-qr'
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
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { redirectWithToast } from '~/utils/toast.server'

const REPRINT_REASONS = [
	{ value: 'Print quality issue', name: 'Print quality issue' },
	{ value: 'Printer malfunction', name: 'Printer malfunction' },
	{ value: 'Wrong card stock loaded', name: 'Wrong card stock loaded' },
	{ value: 'Badge damaged', name: 'Badge damaged' },
	{ value: 'Name correction', name: 'Name correction' },
	{ value: 'Photo update', name: 'Photo update' },
	{ value: 'Participant type change', name: 'Participant type change' },
	{ value: 'Wrong template used', name: 'Wrong template used' },
] as const

const ReprintSchema = z.object({
	id: z.string(),
	reason: z.enum(
		REPRINT_REASONS.map(r => r.value) as [string, ...string[]],
		{ required_error: 'Please select a reason' },
	),
})

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: ReprintSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { id: participantId, reason } = submission.value

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
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

	invariantResponse(participant, 'Participant not found', { status: 404 })
	invariantResponse(participant.status === RequestStatus.PRINTED, 'Participant is not in PRINTED status', { status: 400 })

	const maxReprints = await getSetting<number>(SettingKeys.REPRINT_MAX_COUNT)
	invariantResponse(participant.reprintCount < maxReprints, 'Reprint limit reached', { status: 400 })

	// Increment reprint count
	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			reprintCount: { increment: 1 },
		},
	})

	// Create PRINT approval record for the self-service reprint
	await prisma.approval.create({
		data: {
			participantId: participant.id,
			stepId: participant.step.id,
			userId: user.id,
			action: Action.PRINT,
			result: 'SUCCESS',
			remarks: `Printer reprint: ${reason} (reprint #${participant.reprintCount + 1})`,
		},
	})

	// Log reprint action
	await auditRequest({
		request,
		action: AuditAction.REPRINT,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participant.id,
		description: `Badge reprinted (self-service) for ${participant.firstName} ${participant.familyName} (reprint #${participant.reprintCount + 1})`,
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
			reprint: {
				reprintNumber: participant.reprintCount + 1,
				reason,
				printedBy: user.id,
				printedAt: new Date().toISOString(),
				selfService: true,
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
		title: 'Badge Reprinted',
		description: `Badge reprinted successfully for ${participant.firstName} ${participant.familyName} (reprint #${participant.reprintCount + 1}).`,
	})
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	const url = new URL(request.url)
	const baseUrl = `${url.protocol}//${url.host}`

	const { participantId } = params

	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['printer'])

	// Verify this is a PRINTED participant the printer has access to
	const participant = await prisma.participant.findFirst({
		where: {
			id: participantId,
			deletedAt: null,
			status: RequestStatus.PRINTED,
			approvals: {
				some: { action: Action.PRINT, stepId: { in: accessibleStepIds } },
			},
		},
		include: {
			documents: true,
			title: {
				select: { name: true },
			},
			country: {
				select: { name: true },
			},
			nationality: {
				select: { name: true },
			},
			participantType: {
				select: { name: true },
			},
			event: {
				select: { name: true },
			},
		},
	})

	invariantResponse(participant, 'Participant not found or not eligible for reprint', { status: 403 })

	const maxReprints = await getSetting<number>(SettingKeys.REPRINT_MAX_COUNT)
	invariantResponse(
		participant.reprintCount < maxReprints,
		'Reprint limit reached',
		{ status: 400 },
	)

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
		profileUrl: badgeQrUrl(baseUrl, 'requests', participant),
		reprintCount: participant.reprintCount,
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

	const photo = participant.documents.find(doc => doc.documentType === 'PHOTO')

	return json({
		general: generalInfo,
		professional: professionalInfo,
		photo,
		templateAttachments: badgeTemplateRecord?.attachments ?? [],
		badgeTemplate: badgeTemplateRecord?.badgeTemplate ?? null,
		participantTypeName: participant.participantType.name,
		eventName: participant.event?.name,
	})
}

export default function PrinterSelfReprintDialog() {
	const params = useParams()
	const navigate = useNavigate()
	const actionData = useActionData<typeof action>()
	const [form, fields] = useForm({
		id: 'printer-reprint-form',
		constraint: getZodConstraint(ReprintSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ReprintSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			id: params.participantId,
			reason: '',
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
				isReprint: true,
				reprintCount: general.reprintCount + 1,
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
				navigate(`/printer/requests/${params.participantId}`)
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
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
						<RefreshCw className="h-6 w-6 text-amber-600" />
					</div>
					<DialogTitle className="text-center">Reprint Badge</DialogTitle>
					<DialogDescription className="text-center">
						Preview the badge and provide a reason for reprinting.
					</DialogDescription>
				</DialogHeader>

				{/* Reprint Info Banner */}
				<div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
					<div className="flex items-center gap-2">
						<Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-800">
							REPRINT #{general.reprintCount + 1}
						</Badge>
						<span className="text-sm text-amber-800">
							{general.firstName} {general.familyName}
						</span>
					</div>
				</div>

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
						<BadgeComponent
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

				<DialogFooter className="flex-shrink-0">
					<Form
						method="POST"
						{...getFormProps(form)}
						className="flex w-full flex-col gap-3"
					>
						<AuthenticityTokenInput />
						<HoneypotInputs />
						<InputField meta={fields.id} type="hidden" />

						<div className="space-y-1.5">
							<label htmlFor={fields.reason.id} className="text-sm font-medium">
								Reason for reprint
							</label>
							<SelectField
								meta={fields.reason}
								items={[...REPRINT_REASONS]}
								placeholder="Select a reason..."
							/>
							{fields.reason.errors && (
								<p className="text-sm text-destructive">{fields.reason.errors}</p>
							)}
						</div>

						<div className="flex w-full gap-2">
							<Button
								type="button"
								variant="outline"
								className="flex-1"
								onClick={() => navigate(`/printer/requests/${params.participantId}`)}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								className="flex-1 bg-amber-600 hover:bg-amber-700"
							>
								<Printer className="mr-2 h-4 w-4" />
								Confirm Reprint
							</Button>
						</div>
					</Form>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
