import { parseWithZod } from '@conform-to/zod'
import { Action, AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { format } from 'date-fns'
import {
	ArrowLeft,
	Briefcase,
	Calendar,
	CalendarCheck2,
	FileImageIcon,
	Globe,
	Mail,
	MapPin,
	Pencil,
	Phone,
	Users,
} from 'lucide-react'
import { z } from 'zod'
import { ActionForm } from '~/components/action-form'
import { DocumentPreview } from '~/components/document-preview'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { getParticipantDocumentFileSrc, invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { processParticipant } from '~/utils/workflow.server'

export const ParticipantApprovalSchema = z.object({
	id: z.string(),
})

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
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
			approvals: {
				orderBy: {
					createdAt: 'desc',
				},
			},
			step: {
				include: {
					role: {
						select: {
							name: true,
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

	const meetings = await prisma.meetingType.findMany({
		where: {
			id: {
				in: participant.wishList?.split(',') ?? [],
			},
		},
	})

	const wishlistInfo = {
		needsVisa: participant.needsVisa,
		needsCarPass: participant.needsCarPass,
		vehicleType: participant.vehicleType,
		vehiclePlateNumber: participant.vehiclePlateNumber,
		needsCarFromOrganizer: participant.needsCarFromOrganizer,
		flightNumber: participant.flightNumber,
		arrivalDate: participant.arrivalDate,
		meetings: participant.wishList?.split(','),
	}

	const approvals = participant?.approvals.map(approval => ({
		id: approval.id,
		result: approval.result,
		remarks: approval.remarks,
	}))

	const photo = participant?.documents.find(doc => doc.documentType === 'PHOTO')
	const passport = participant?.documents.find(
		doc => doc.documentType === 'PASSPORT',
	)
	const letter = participant?.documents.find(
		doc => doc.documentType === 'LETTER',
	)

	const step =
		participant?.step.role.name === 'reviewer'
			? 'focal person'
			: participant?.step.role.name

	return json({
		general: generalInfo,
		professional: professionalInfo,
		wishlist: wishlistInfo,
		photo,
		passport,
		letter,
		meetings,
		templates: participant?.participantType.templates,
		approvals,
		skipApprovals: participant.status === 'INPROGRESS',
		step,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	const submission = parseWithZod(formData, {
		schema: ParticipantApprovalSchema,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { id: participantId } = submission.value

	if (intent === 'bypass') {
		await processParticipant(participantId, user.id, Action.BYPASS)

		await auditRequest({
			request,
			action: AuditAction.BYPASS,
			entityType: AuditEntityType.PARTICIPANT,
			entityId: participantId,
			description: 'Participant bypassed',
			userId: user.id,
		})
	}

	return redirectWithToast('/admin/participants', {
		type: 'success',
		title: `Participant Updated`,
		description: `Participant updated successfully.`,
	})
}

export default function ParticipantProfile() {
	const {
		general,
		professional,
		wishlist,
		photo,
		passport,
		letter,
		meetings,
		approvals,
		skipApprovals,
		step,
	} = useLoaderData<typeof loader>()

	const photoLink = getParticipantDocumentFileSrc(photo?.id ?? '')
	const passportLink = getParticipantDocumentFileSrc(passport?.id ?? '')
	const letterLink = getParticipantDocumentFileSrc(letter?.id ?? '')

	return (
		<div className="container mx-auto px-4">
			<div className="px-4 py-8 sm:px-4 lg:px-4">
				<div className="mb-6 flex flex-col sm:flex-row sm:items-center">
					<Avatar className="h-24 w-24 ring-4 ring-gray-200 sm:h-32 sm:w-32">
						<AvatarImage src={photoLink} alt={general.firstName} />
						<AvatarFallback>RC</AvatarFallback>
					</Avatar>
					<div className="mt-4 flex-grow sm:ml-6 sm:mt-0">
						<h1 className="text-3xl font-bold text-gray-900">
							{general.firstName} {general.familyName} ({general.title})
						</h1>
						<p className="text-xl text-gray-600">{professional.jobTitle}</p>
					</div>
					<div className="mt-4 flex space-x-2 sm:mt-0">
						{skipApprovals && (
							<ActionForm
								method="POST"
								data={{
									id: general.id,
								}}
								buttonContent="Bypass"
								buttonSize="sm"
								intent="bypass"
								buttonVariant="destructive"
								showContentOnDoubleCheck={false}
								replacementContentOnDoubleCheck="Bypass approvals?"
							/>
						)}

						<Button size="sm" variant="outline" asChild>
							<Link to={`/admin/participants`}>
								<ArrowLeft className="h-4 w-4" />
							</Link>
						</Button>
					</div>
				</div>

				<div className="grid grid-cols-1 gap-6 md:grid-cols-3">
					<Card className="col-span-2">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-lg font-semibold">
								Participant Details
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div className="space-y-4">
									<InfoItem
										icon={<Briefcase aria-hidden="true" />}
										label="Gender"
										value={general.gender}
									/>
									<InfoItem
										icon={<Users aria-hidden="true" />}
										label="Organization"
										value={professional.organization}
									/>
									<InfoItem
										icon={<MapPin aria-hidden="true" />}
										label="City"
										value={professional.city}
									/>
									<InfoItem
										icon={<Globe aria-hidden="true" />}
										label="Country"
										value={professional.country}
									/>
									<InfoItem
										icon={<Globe aria-hidden="true" />}
										label="Nationality"
										value={general.nationality}
									/>
								</div>
								<div className="space-y-4">
									<InfoItem
										icon={<Calendar aria-hidden="true" />}
										label="Date of Birth"
										value={general.dateOfBirth}
									/>
									<InfoItem
										icon={<Mail aria-hidden="true" />}
										label="Email"
										value={professional.email}
									/>
									<InfoItem
										icon={<Phone aria-hidden="true" />}
										label="Telephone"
										value={professional.telephone ?? 'N/A'}
									/>
									<InfoItem
										icon={<Globe aria-hidden="true" />}
										label="Preferred Language"
										value={professional.preferredLanguage ?? 'N/A'}
									/>
									<InfoItem
										icon={<FileImageIcon aria-hidden="true" />}
										label="Passport Number"
										value={general.passportNumber ?? 'N/A'}
									/>
									<InfoItem
										icon={<CalendarCheck2 aria-hidden="true" />}
										label="Passport Expiry"
										value={
											general.passportExpiry
												? format(new Date(general.passportExpiry), 'PP')
												: 'N/A'
										}
									/>
								</div>
							</div>
						</CardContent>
					</Card>

					<div className="space-y-6">
						<Card>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-lg font-semibold">
									Current Status
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="flex w-full">
									<span className="inline-flex w-full items-center justify-center rounded-full bg-emerald-50 px-4 py-2 text-lg font-medium text-emerald-700 ring-1 ring-inset ring-emerald-700/10">
										{step}
									</span>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-lg font-semibold">
									Documents
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								{[
									{ type: 'PHOTO', link: photoLink, doc: photo },
									{ type: 'PASSPORT', link: passportLink, doc: passport },
									{ type: 'LETTER', link: letterLink, doc: letter },
								].map(({ type, link, doc }) => (
									<div key={type} className="flex-1">
										{doc ? (
											<DocumentPreview
												title={`${type} - ${general.firstName} ${general.familyName}`}
												documentUrl={link}
												contentType={doc.contentType}
												type={type}
												onDownload={() => {
													window.open(link, '_blank')
												}}
											/>
										) : (
											<div className="flex items-center gap-2 space-x-2 font-medium text-gray-400">
												<FileImageIcon className="h-4 w-4" />
												<span>{type} (Missing)</span>
											</div>
										)}
									</div>
								))}
								<div className="mb-2 flex items-center justify-between">
									<h3 className="text-lg font-medium text-gray-900">
										Wishes to Participate
									</h3>
									<Button size="sm" variant="outline" asChild>
										<Link to={`/admin/participants/${general.id}/edit`}>
											<Pencil className="h-4 w-4" />
										</Link>
									</Button>
								</div>
								<ul className="list-disc pl-5">
									{meetings?.map(meeting => (
										<li key={meeting.id}>{meeting.name}</li>
									))}
								</ul>
								<div>
									<h3 className="text-lg font-medium text-gray-900">
										Approvals
									</h3>
									<ul className="list-disc pl-5">
										{approvals?.map(approval => {
											if (approval.remarks === 'Badge Printed') {
												const printCount = approvals.filter(
													a => a.remarks === 'Badge Printed',
												).length
												if (
													approval ===
													approvals.find(a => a.remarks === 'Badge Printed')
												) {
													return (
														<li key={approval.id}>
															{approval.remarks} (x{printCount})
														</li>
													)
												}
												return null
											}
											return <li key={approval.id}>{approval.remarks}</li>
										})}
									</ul>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	)
}

function InfoItem({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode
	label: string
	value: string
}) {
	return (
		<div className="flex items-center space-x-2">
			<div className="flex-shrink-0 text-gray-400">{icon}</div>
			<div>
				<dt className="text-sm font-medium text-gray-500">{label}</dt>
				<dd className="mt-1 text-sm text-gray-900">{value}</dd>
			</div>
		</div>
	)
}
