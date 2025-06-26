import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'

import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Action, AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useBlocker,
	useLoaderData,
	useParams,
} from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { Badge } from '~/components/badge'
import { InputField } from '~/components/conform/InputField'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
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
import { processParticipant } from '~/utils/workflow.server'

export const ParticipantApprovalSchema = z.object({
	id: z.string(),
})

export const ParticipantPrintSchema = z.object({
	id: z.string().optional(),
})

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['mofa-printer', 'printer'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'not-printed') {
		return redirectWithToast(`/validator/requests`, {
			type: 'success',
			title: 'Badge Not Printed',
			description: `Participant badge not printed.`,
		})
	}

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

	const userRoles = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		include: {
			roles: true,
		},
	})

	const { id: participantId } = submission.value

	const participant = await prisma.participant.findFirst({
		where: {
			id: participantId,
			step: { roleId: { in: userRoles.roles.map(role => role.id) } },
		},
		select: { id: true },
	})

	invariantResponse(participant, 'Participant not found', {
		status: 404,
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

	return redirectWithToast(`/validator/requests`, {
		type: 'success',
		title: 'Badge Printed',
		description: `Participant badge printed.`,
	})
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['mofa-printer', 'printer'])
	const userRoles = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		include: {
			roles: true,
		},
	})
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: {
			id: participantId,
			step: { roleId: { in: userRoles.roles.map(role => role.id) } },
		},
		include: {
			documents: true,
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
				include: {
					templates: {
						include: {
							attachments: {
								select: {
									id: true,
									altText: true,
								},
							},
						},
					},
				},
			},
		},
	})

	invariantResponse(participant, 'Not Found', { status: 404 })

	const meetingTypes = await prisma.meetingType.findMany({
		where: {
			id: {
				in: participant.wishList?.split(','),
			},
		},
		select: {
			name: true,
		},
	})

	const generalInfo = {
		id: participant.id,
		tenantId: participant.tenantId,
		eventId: participant.eventId,
		participantTypeId: participant.participantTypeId,
		gender: participant.gender,
		title: participant.title,
		firstName: participant.firstName,
		familyName: participant.familyName,
		dateOfBirth: participant.dateOfBirth,
		nationality: participant.nationality.name,
		passportNumber: participant.passportNumber,
		passportExpiry: participant.passportExpiry,
		attendClosedSession: meetingTypes.some(
			type => type.name === 'Closed Session',
		),
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
		templates: participant?.participantType.templates,
	})
}

export default function ParticipantProfile() {
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
	const { general, professional, photo, templates } =
		useLoaderData<typeof loader>()

	const blocker = useBlocker(
		({ currentLocation, nextLocation }) =>
			currentLocation.pathname !== nextLocation.pathname,
	)

	const photoLink = getParticipantDocumentFileSrc(photo?.id ?? '')

	const badgeTemplate = templates.find(
		template => template.templateType === 'BADGE',
	)

	const frontPageTemplate = badgeTemplate?.attachments.find(
		attachment => attachment.altText === 'Front',
	)

	const backPageTemplate = badgeTemplate?.attachments.find(
		attachment => attachment.altText === 'Back',
	)

	const frontPageTemplateLink = getAttachmentFileSrc(
		frontPageTemplate?.id ?? '',
	)
	const backPageTemplateLink = getAttachmentFileSrc(backPageTemplate?.id ?? '')

	return (
		<>
			<Card className="mx-auto w-full max-w-full">
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle>Participant Badge</CardTitle>
				</CardHeader>
				<CardContent>
					<Badge
						badgeInfo={{
							id: `SHIRINAB-${general.id}`,
							name: `${general.firstName} ${general.familyName}`,
							organization: professional.organization,
							closedSession: general.attendClosedSession,
						}}
						photoUrl={photoLink}
						frontBackgroundUrl={frontPageTemplateLink}
						backBackgroundUrl={backPageTemplateLink}
					/>
				</CardContent>
				<CardFooter className="flex justify-end space-x-2">
					<Button variant="outline" asChild>
						<Link to="/validator/requests">Close</Link>
					</Button>
				</CardFooter>
			</Card>

			{blocker.state === 'blocked' ? (
				<Dialog open={blocker.state === 'blocked'} onOpenChange={blocker.reset}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Confirm Print</DialogTitle>
							<DialogDescription>
								Please confirm if you printed the generated badge
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Form
								className="grid gap-4"
								method="POST"
								{...getFormProps(form)}
							>
								<AuthenticityTokenInput />
								<HoneypotInputs />
								<InputField meta={fields.id} type="hidden" />

								<div className="flex w-full gap-2">
									<Button
										type="submit"
										className="flex-grow"
										variant="destructive"
										name="intent"
										value="not-printed"
									>
										No, I did not print it
									</Button>

									<Button
										type="submit"
										className="flex-grow"
										name="intent"
										value="printed"
									>
										Yes, I printed it
									</Button>
								</div>
							</Form>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			) : null}
		</>
	)
}
