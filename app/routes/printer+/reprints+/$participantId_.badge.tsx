import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Action, AuditAction, AuditEntityType } from '@prisma/client'
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
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import {
	getAttachmentFileSrc,
	getParticipantDocumentFileSrc,
	invariantResponse,
} from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

export const ReprintSchema = z.object({
	id: z.string(),
})

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

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

	const { id: participantId } = submission.value

	if (intent === 'not-printed') {
		return redirectWithToast(`/printer/reprints/${participantId}`, {
			type: 'message',
			title: 'Reprint Cancelled',
			description: `Badge was not reprinted.`,
		})
	}

	// Get participant (no step filter needed for reprints)
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

	// Verify there's a pending reprint request
	const pendingRequest = await prisma.approval.findFirst({
		where: {
			participantId: participant.id,
			action: 'REPRINT',
			result: 'SUCCESS',
		},
		orderBy: { createdAt: 'desc' },
	})

	if (pendingRequest) {
		const fulfilledPrint = await prisma.approval.findFirst({
			where: {
				participantId: participant.id,
				action: 'PRINT',
				createdAt: { gt: pendingRequest.createdAt },
			},
		})

		if (fulfilledPrint) {
			return redirectWithToast(`/printer/reprints`, {
				type: 'error',
				title: 'Already Reprinted',
				description: `This reprint request has already been fulfilled.`,
			})
		}
	} else {
		return redirectWithToast(`/printer/reprints`, {
			type: 'error',
			title: 'No Reprint Request',
			description: `There is no pending reprint request for this participant.`,
		})
	}

	// Increment reprint count
	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			reprintCount: { increment: 1 },
		},
	})

	// Create PRINT approval record (for the reprint)
	await prisma.approval.create({
		data: {
			participantId: participant.id,
			stepId: participant.step.id,
			userId: user.id,
			action: Action.PRINT,
			result: 'SUCCESS',
			remarks: `Badge Reprinted (reprint #${participant.reprintCount + 1})`,
		},
	})

	// Log reprint action
	await auditRequest({
		request,
		action: AuditAction.REPRINT,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participant.id,
		description: `Badge reprinted for ${participant.firstName} ${participant.familyName} (reprint #${participant.reprintCount + 1})`,
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
				printedBy: user.id,
				printedAt: new Date().toISOString(),
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

	return redirectWithToast(`/printer/reprints`, {
		type: 'success',
		title: 'Badge Reprinted',
		description: `Badge reprinted successfully for ${participant.firstName} ${participant.familyName} (reprint #${participant.reprintCount + 1}).`,
	})
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['printer'])
	const url = new URL(request.url)
	const baseUrl = `${url.protocol}//${url.host}`

	const { participantId } = params

	// Get participant (no step filter needed for reprints)
	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
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

	invariantResponse(participant, 'Participant not found', { status: 404 })

	// Verify there's a pending reprint request
	const pendingRequest = await prisma.approval.findFirst({
		where: {
			participantId: participant.id,
			action: 'REPRINT',
			result: 'SUCCESS',
		},
		orderBy: { createdAt: 'desc' },
	})

	if (pendingRequest) {
		const fulfilledPrint = await prisma.approval.findFirst({
			where: {
				participantId: participant.id,
				action: 'PRINT',
				createdAt: { gt: pendingRequest.createdAt },
			},
		})

		if (fulfilledPrint) {
			throw new Response('Reprint request already fulfilled', { status: 400 })
		}
	} else {
		throw new Response('No pending reprint request', { status: 400 })
	}

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
		profileUrl: `${baseUrl}/printer/reprints/${participant.id}`,
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

	const photo = participant?.documents.find(doc => doc.documentType === 'PHOTO')

	return json({
		general: generalInfo,
		professional: professionalInfo,
		photo,
		templateAttachments: badgeTemplateRecord?.attachments ?? [],
		badgeTemplate: badgeTemplateRecord?.badgeTemplate ?? null,
		participantTypeName: participant?.participantType.name,
		eventName: participant?.event?.name,
		reprintReason: pendingRequest.remarks?.replace('Reprint requested: ', '') || 'No reason provided',
	})
}

export default function ReprintBadgeDialog() {
	const params = useParams()
	const navigate = useNavigate()
	const actionData = useActionData<typeof action>()
	const schema = ReprintSchema
	const [form, fields] = useForm({
		id: 'reprint-confirmation-form',
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
		reprintReason,
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
				// Add reprint indicator
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
				navigate('/printer/reprints')
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
						This is a reprint request. Preview the badge and confirm printing.
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
					<span className="max-w-[300px] truncate text-sm text-amber-700" title={reprintReason}>
						Reason: {reprintReason}
					</span>
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
							variant="outline"
							name="intent"
							value="not-printed"
							className="flex-1"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							name="intent"
							value="printed"
							className="flex-1 bg-amber-600 hover:bg-amber-700"
						>
							<Printer className="mr-2 h-4 w-4" />
							Confirm Reprint
						</Button>
					</Form>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
