import { json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useSearchParams } from '@remix-run/react'
import { format } from 'date-fns'
import {
	ArrowLeft,
	Briefcase,
	Calendar,
	CheckCircleIcon,
	CircleDashedIcon,
	Edit2Icon,
	FileCheck,
	FileImage,
	FileText,
	SkipForwardIcon,
	User,
	XCircleIcon,
} from 'lucide-react'
import { DocumentPreview } from '~/components/document-preview'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { getParticipantDocumentFileSrc, invariantResponse } from '~/utils/misc'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
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
					createdAt: 'asc',
				},
				select: {
					id: true,
					action: true,
					result: true,
					remarks: true,
					createdAt: true,
					step: {
						select: {
							name: true,
							role: {
								select: {
									name: true,
								},
							},
						},
					},
					user: {
						select: {
							username: true,
						},
					},
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
		participantType: participant.participantType.name,
		gender: participant.gender,
		title: participant.title?.name ?? '',
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

	const SYSTEM_STEPS = ['Request Received', 'Review Request']
	const isSystemStep = (stepName: string) =>
		SYSTEM_STEPS.some(name =>
			stepName.toLowerCase().includes(name.toLowerCase()),
		)

	const getActionLabel = (action: string) => {
		const labels: Record<string, string> = {
			APPROVE: 'Approved',
			REJECT: 'Rejected',
			PRINT: 'Printed',
			COLLECT: 'Collected',
			NOTIFY: 'Notified',
			ARCHIVE: 'Archived',
			BYPASS: 'Bypassed',
		}
		return labels[action] || action
	}

	const approvals = participant?.approvals.map(approval => {
		const isBypass = approval.action === 'BYPASS'
		const isAdminReject = approval.remarks?.includes(
			'Rejected by administrator',
		)

		return {
			id: approval.id,
			result: approval.result,
			remarks: approval.remarks,
			createdAt: approval.createdAt,
			stepName: isBypass
				? 'Admin Bypass'
				: isAdminReject
					? 'Admin Reject'
					: approval.step.name,
			stepAction: getActionLabel(approval.action),
			roleName:
				isBypass || isAdminReject
					? 'Admin'
					: isSystemStep(approval.step.name)
						? 'System'
						: approval.step.role.name,
			username:
				isBypass || isAdminReject
					? approval.user?.username || 'Admin'
					: isSystemStep(approval.step.name)
						? 'System'
						: approval.user?.username || 'System',
		}
	})

	const photo = participant?.documents.find(doc => doc.documentType === 'PHOTO')
	const passport = participant?.documents.find(
		doc => doc.documentType === 'PASSPORT',
	)
	const letter = participant?.documents.find(
		doc => doc.documentType === 'LETTER',
	)

	const canBypass = ![
		'PRINTED',
		'BYPASSED',
		'NOTIFIED',
		'ARCHIVED',
		'CANCELLED',
	].includes(participant.status)

	const canAdminReject = [
		'INPROGRESS',
		'PRINTED',
		'BYPASSED',
		'NOTIFIED',
	].includes(participant.status)

	const canAdvance =
		participant.status === 'INPROGRESS' && participant.step.nextStepId != null

	// Can undo bypass if current status is BYPASSED — we'll look up the prior step from the approval record
	const canUndoBypass = participant.status === 'BYPASSED'

	return json({
		stepId: participant.stepId,
		general: generalInfo,
		professional: professionalInfo,
		photo,
		passport,
		letter,
		meetings,
		approvals,
		canBypass,
		canAdminReject,
		canAdvance,
		canUndoBypass,
		status: participant.status,
		nextStep: {
			name: participant.step.name,
			action: participant.step.action,
			roleName:
				participant.step.role.name === 'reviewer'
					? 'Focal Person'
					: participant.step.role.name,
		},
	})
}

export default function ParticipantProfile() {
	const {
		general,
		professional,
		photo,
		passport,
		letter,
		meetings,
		approvals,
		canBypass,
		canAdminReject,
		canAdvance,
		canUndoBypass,
		status,
		nextStep,
	} = useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()

	const photoLink = getParticipantDocumentFileSrc(photo?.id ?? '')
	const passportLink = getParticipantDocumentFileSrc(passport?.id ?? '')
	const letterLink = getParticipantDocumentFileSrc(letter?.id ?? '')

	const documents = [
		{
			type: 'PHOTO',
			label: 'Photo',
			icon: FileImage,
			link: photoLink,
			doc: photo,
			color: 'bg-emerald-500',
		},
		{
			type: 'PASSPORT',
			label: 'Passport',
			icon: FileText,
			link: passportLink,
			doc: passport,
			color: 'bg-emerald-500',
		},
		{
			type: 'LETTER',
			label: 'Letter',
			icon: FileCheck,
			link: letterLink,
			doc: letter,
			color: 'bg-emerald-500',
		},
	]

	return (
		<div className="container mx-auto px-4">
			{/* Header Card */}
			<div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-400 via-green-400 to-teal-400 p-[1px] shadow-sm">
				<div className="absolute inset-0 bg-gradient-to-br from-emerald-400 via-green-400 to-teal-400 opacity-10 blur-xl" />
				<div className="relative rounded-[10px] bg-white/95 backdrop-blur-sm">
					<div className="absolute right-0 top-0 h-40 w-40 -translate-y-10 translate-x-10 rounded-full bg-gradient-to-br from-emerald-200/40 to-green-200/40 blur-2xl" />
					<div className="absolute bottom-0 left-0 h-32 w-32 -translate-x-10 translate-y-10 rounded-full bg-gradient-to-tr from-green-200/40 to-teal-200/40 blur-2xl" />

					<div className="relative p-6">
						<div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex items-center gap-4">
								<div className="relative">
									<div className="absolute -inset-1 rounded-full bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 opacity-75 blur-sm" />
									<Avatar className="relative h-20 w-20 ring-4 ring-white">
										<AvatarImage src={photoLink} alt={general.firstName} />
										<AvatarFallback className="bg-gradient-to-br from-emerald-100 to-green-100 text-xl font-semibold text-green-700">
											{general.firstName[0]}
											{general.familyName[0]}
										</AvatarFallback>
									</Avatar>
								</div>
								<div>
									<h1 className="text-2xl font-bold text-slate-800">
										{general.title} {general.firstName} {general.familyName}
									</h1>
									<p className="font-medium text-slate-600">
										{professional.jobTitle}
									</p>
									<p className="text-sm text-slate-500">
										{professional.organization}
									</p>
								</div>
							</div>

							{/* Action Buttons */}
							<div className="flex flex-wrap items-center gap-2">
								<Button asChild size="sm" variant="outline">
									<Link
										to={`/admin/participants${searchParams.size ? '?' + searchParams.toString() : ''}`}
									>
										<ArrowLeft className="mr-2 h-4 w-4" />
										Back
									</Link>
								</Button>
								{canAdvance && (
									<Button size="sm" asChild variant="outline">
										<Link to={`/admin/participants/${general.id}/advance`}>
											Advance
										</Link>
									</Button>
								)}
								{canBypass && (
									<Button size="sm" variant="outline" asChild>
										<Link to={`/admin/participants/${general.id}/bypass`}>
											Bypass
										</Link>
									</Button>
								)}
								{canAdminReject && (
									<Button size="sm" variant="destructive" asChild>
										<Link to={`/admin/participants/${general.id}/admin-reject`}>
											Reject
										</Link>
									</Button>
								)}
								{canUndoBypass && (
									<Button size="sm" variant="outline" asChild>
										<Link to={`/admin/participants/${general.id}/undo-bypass`}>
											Undo Bypass
										</Link>
									</Button>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Info Grid */}
			<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
				<InfoCard
					icon={User}
					label="Personal"
					items={[
						{ label: 'Gender', value: general.gender },
						{
							label: 'Date of Birth',
							value: format(new Date(general.dateOfBirth), 'PP'),
						},
						{ label: 'Nationality', value: general.nationality },
						{ label: 'Passport No.', value: general.passportNumber ?? 'N/A' },
						{
							label: 'Passport Expiry',
							value: general.passportExpiry
								? format(new Date(general.passportExpiry), 'PP')
								: 'N/A',
						},
					]}
				/>
				<InfoCard
					icon={Briefcase}
					label="Professional"
					items={[
						{ label: 'Organization', value: professional.organization },
						{ label: 'Job Title', value: professional.jobTitle },
						{ label: 'City', value: professional.city },
						{ label: 'Country', value: professional.country },
						{
							label: 'Language',
							value: professional.preferredLanguage ?? 'N/A',
						},
					]}
				/>
			</div>

			{/* Documents and Meetings Row */}
			<div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
				{/* Documents Card */}
				<Card>
					<CardContent className="p-4">
						<div className="mb-3 flex items-center gap-2">
							<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
								<FileImage className="h-4 w-4 text-slate-600" />
							</div>
							<span className="font-semibold text-slate-700">Documents</span>
						</div>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
							{documents.map(
								({ type, label, icon: Icon, link, doc, color }) => (
									<div key={type}>
										{doc ? (
											<DocumentPreview
												title={`${general.firstName} ${general.familyName} - ${label}`}
												documentUrl={link}
												contentType={doc.contentType}
												onDownload={() => {
													const downloadLink = document.createElement('a')
													downloadLink.href = link
													downloadLink.download = `${label.toLowerCase()}.${doc.contentType.split('/')[1] || 'file'}`
													downloadLink.click()
												}}
												type={label}
												icon={Icon}
												color={color}
											/>
										) : (
											<div className="flex items-center gap-3 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 px-3 py-2 text-slate-400">
												<div
													className={`flex h-8 w-8 items-center justify-center rounded-lg ${color} opacity-30`}
												>
													<Icon className="h-4 w-4 text-white" />
												</div>
												<div>
													<p className="text-sm font-medium">{label}</p>
													<p className="text-xs">Not uploaded</p>
												</div>
											</div>
										)}
									</div>
								),
							)}
						</div>
					</CardContent>
				</Card>

				{/* Accreditation Details Card */}
				<Card>
					<CardContent className="p-4">
						<div className="mb-3 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
									<Calendar className="h-4 w-4 text-slate-600" />
								</div>
								<span className="font-semibold text-slate-700">
									Accreditation Details
								</span>
							</div>
							<Button
								size="sm"
								variant="outline"
								className="h-7 px-2"
								title="Edit Details"
								asChild
							>
								<Link to={`/admin/participants/${general.id}/edit`}>
									<Edit2Icon className="h-3.5 w-3.5" />
								</Link>
							</Button>
						</div>
						<div className="space-y-2">
							<div className="flex justify-between text-sm">
								<span className="text-slate-500">Participant Type</span>
								<Badge
									variant="secondary"
									className="bg-emerald-50 text-emerald-700"
								>
									{general.participantType}
								</Badge>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-slate-500">Meetings</span>
								{meetings && meetings.length > 0 ? (
									<span className="font-medium text-slate-700">
										{meetings.map(m => m.name).join(', ')}
									</span>
								) : (
									<span className="text-slate-400">None selected</span>
								)}
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Approval History */}
			<div className="mt-6">
				<h2 className="mb-4 text-lg font-semibold text-slate-800">
					Approval History
				</h2>
				<Card>
					<CardContent className="p-4">
						{approvals && approvals.length > 0 ? (
							<div className="space-y-2">
								{approvals.map(approval => (
									<div
										key={approval.id}
										className="flex items-center justify-between rounded-lg border bg-white p-3 text-sm shadow-sm"
									>
										<div className="flex items-center gap-3">
											{approval.result === 'SUCCESS' && (
												<CheckCircleIcon className="h-5 w-5 text-emerald-500" />
											)}
											{approval.result === 'FAILURE' && (
												<XCircleIcon className="h-5 w-5 text-red-500" />
											)}
											{approval.result === 'SKIPPED' && (
												<SkipForwardIcon className="h-5 w-5 text-amber-500" />
											)}
											<div>
												<span className="font-medium text-slate-800">
													{approval.stepName}
												</span>
												<span className="ml-2 text-slate-500">
													({approval.stepAction})
												</span>
											</div>
										</div>
										<div className="text-right text-xs text-slate-500">
											<div className="font-medium">{approval.username}</div>
											<div>
												{format(new Date(approval.createdAt), 'MMM d, HH:mm')}
											</div>
										</div>
									</div>
								))}

								{/* Next Step */}
								{status === 'INPROGRESS' && (
									<div className="mt-4 flex items-center justify-between rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 p-3 text-sm">
										<div className="flex items-center gap-3">
											<CircleDashedIcon className="h-5 w-5 text-blue-500" />
											<div>
												<span className="font-medium text-blue-700">
													{nextStep.name}
												</span>
												<span className="ml-2 text-blue-500">
													({nextStep.action})
												</span>
											</div>
										</div>
										<div className="text-right text-xs text-blue-600">
											<div className="font-medium">PENDING</div>
											<div>Waiting: {nextStep.roleName}</div>
										</div>
									</div>
								)}
							</div>
						) : (
							<div className="space-y-2">
								<p className="text-sm text-slate-500">
									No approval actions yet
								</p>
								{status === 'INPROGRESS' && (
									<div className="flex items-center justify-between rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 p-3 text-sm">
										<div className="flex items-center gap-3">
											<CircleDashedIcon className="h-5 w-5 text-blue-500" />
											<div>
												<span className="font-medium text-blue-700">
													{nextStep.name}
												</span>
												<span className="ml-2 text-blue-500">
													({nextStep.action})
												</span>
											</div>
										</div>
										<div className="text-right text-xs text-blue-600">
											<div className="font-medium">PENDING</div>
											<div>Waiting: {nextStep.roleName}</div>
										</div>
									</div>
								)}
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			<Outlet />
		</div>
	)
}

function InfoCard({
	icon: Icon,
	label,
	items,
}: {
	icon: React.ElementType
	label: string
	items: { label: string; value: string }[]
}) {
	return (
		<Card className="transition-shadow hover:shadow-md">
			<CardContent className="p-4">
				<div className="mb-3 flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
						<Icon className="h-4 w-4 text-slate-600" />
					</div>
					<span className="font-semibold text-slate-700">{label}</span>
				</div>
				<div className="space-y-2">
					{items.map(item => (
						<div key={item.label} className="flex justify-between text-sm">
							<span className="text-slate-500">{item.label}</span>
							<span className="font-medium text-slate-700">{item.value}</span>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	)
}
