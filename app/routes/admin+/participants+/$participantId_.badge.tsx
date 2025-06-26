import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { z } from 'zod'
import { Badge } from '~/components/badge'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import {
	getAttachmentFileSrc,
	getParticipantDocumentFileSrc,
	invariantResponse,
} from '~/utils/misc'

export const ParticipantApprovalSchema = z.object({
	id: z.string(),
})

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['printer'])
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
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
	const { general, professional, photo, templates } =
		useLoaderData<typeof loader>()

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
		<div className="container mx-auto px-4">
			<div>
				<div className="mt-8">
					<Badge
						badgeInfo={{
							name: `${general.firstName} ${general.familyName}`,
							organization: professional.organization,
						}}
						photoUrl={photoLink}
						frontBackgroundUrl={frontPageTemplateLink}
						backBackgroundUrl={backPageTemplateLink}
					/>
				</div>
			</div>
		</div>
	)
}
