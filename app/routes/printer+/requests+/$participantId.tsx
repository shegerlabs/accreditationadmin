import { Action, RequestStatus } from '@prisma/client'
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
	EyeIcon,
	PrinterIcon,
	RefreshCw,
	SkipForwardIcon,
	User,
	XCircleIcon,
} from 'lucide-react'
import { DocumentPreview } from '~/components/document-preview'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import {
	getUserAccessibleStepIds,
	requireUserWithRoles,
} from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { getParticipantDocumentFileSrc, invariantResponse } from '~/utils/misc'
import { getSetting, SettingKeys } from '~/utils/settings.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	const { participantId } = params

	// Get step IDs the user has access to via UserEventAccess
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['printer'])

	const participant = await prisma.participant.findFirst({
		where: {
			id: participantId,
			deletedAt: null,
			OR: [
				{ stepId: { in: accessibleStepIds } },
				{
					status: { in: [RequestStatus.PRINTED, RequestStatus.COLLECTED] },
					approvals: {
						some: { action: Action.PRINT, stepId: { in: accessibleStepIds } },
					},
				},
			],
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

	invariantResponse(participant, 'Access denied', { status: 403 })

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

	const photo = participant?.documents.find(doc => doc.documentType === 'PHOTO')
	const passport = participant?.documents.find(
		doc => doc.documentType === 'PASSPORT',
	)
	const letter = participant?.documents.find(
		doc => doc.documentType === 'LETTER',
	)

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

	const maxReprints = await getSetting<number>(SettingKeys.REPRINT_MAX_COUNT)

	return json({
		general: generalInfo,
		professional: professionalInfo,
		photo,
		passport,
		letter,
		meetings,
		approvals,
		status: participant.status,
		reprintCount: participant.reprintCount,
		maxReprints,
		nextStep: {
			name: participant.step.name,
			action: participant.step.action,
			roleName: participant.step.role.name,
		},
	})
}

export default function PrinterParticipantProfile() {
	const {
		general,
		professional,
		photo,
		passport,
		letter,
		meetings,
		approvals,
		status,
		reprintCount,
		maxReprints,
		nextStep,
	} = useLoaderData<typeof loader>()

	const [searchParams] = useSearchParams()
	const paramsSuffix = searchParams.size ? '?' + searchParams.toString() : ''

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
			color: 'bg-violet-500',
			editable: true,
		},
		{
			type: 'PASSPORT',
			label: 'Passport',
			icon: FileText,
			link: passportLink,
			doc: passport,
			color: 'bg-blue-500',
			editable: false,
		},
		{
			type: 'LETTER',
			label: 'Letter',
			icon: FileCheck,
			link: letterLink,
			doc: letter,
			color: 'bg-emerald-500',
			editable: false,
		},
	]

	return (
		<div className="container mx-auto px-4">
			<Outlet />

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
									<Badge
										className={
											status === 'INPROGRESS'
												? 'mt-2 bg-orange-100 text-orange-800'
												: status === 'PRINTED'
													? 'mt-2 bg-green-100 text-green-800'
													: status === 'COLLECTED'
														? 'mt-2 bg-purple-100 text-purple-800'
														: status === 'BYPASSED'
															? 'mt-2 bg-amber-100 text-amber-800'
															: 'mt-2'
										}
									>
										{status === 'INPROGRESS' ? 'Awaiting Print' : status}
									</Badge>
								</div>
							</div>

							{/* Action Buttons */}
							<div className="flex flex-wrap items-center gap-2">
								<Button
									size="sm"
									variant="outline"
									className="border-slate-300 hover:bg-slate-100"
									asChild
								>
									<Link to={`/printer/requests${paramsSuffix}`}>
										<ArrowLeft className="mr-2 h-4 w-4" />
										Back
									</Link>
								</Button>
								{(status === 'INPROGRESS' || status === 'PRINTED' || status === 'COLLECTED' || status === 'BYPASSED') && (
									<Button size="sm" variant="default" asChild>
										<Link to={`/printer/requests/${general.id}/badge${paramsSuffix}`}>
											<EyeIcon className="mr-1.5 h-4 w-4" />
											View Badge
										</Link>
									</Button>
								)}
								{status === 'PRINTED' && (
									<Button
										size="sm"
										variant="default"
										className="bg-amber-600 hover:bg-amber-700"
										disabled={reprintCount >= maxReprints}
										asChild={reprintCount < maxReprints}
									>
										{reprintCount < maxReprints ? (
											<Link to={`/printer/requests/${general.id}/reprint${paramsSuffix}`}>
												<RefreshCw className="mr-1.5 h-4 w-4" />
												Reprint ({reprintCount}/{maxReprints})
											</Link>
										) : (
											<span className="flex items-center">
												<RefreshCw className="mr-1.5 h-4 w-4" />
												Reprint Limit Reached ({reprintCount}/{maxReprints})
											</span>
										)}
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
						{ label: 'Language', value: professional.preferredLanguage ?? 'N/A' },
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
								({ type, label, icon: Icon, link, doc, color, editable }) => (
									<div key={type} className="relative">
										{doc ? (
											<>
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
												{editable && (
													<Button
														size="sm"
														variant="outline"
														className="absolute right-1 top-1 h-7 w-7 p-0"
														title="Edit Photo"
														asChild
													>
														<Link to={`/printer/requests/${general.id}/edit-photo${paramsSuffix}`}>
															<Edit2Icon className="h-3.5 w-3.5" />
														</Link>
													</Button>
												)}
											</>
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

				{/* Meetings Card */}
				<Card>
					<CardContent className="p-4">
						<div className="mb-3 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
									<Calendar className="h-4 w-4 text-slate-600" />
								</div>
								<span className="font-semibold text-slate-700">Accreditation Details</span>
							</div>
							<Button
								size="sm"
								variant="outline"
								className="h-7 px-2"
								title="Edit Details"
								asChild
							>
								<Link to={`/printer/requests/${general.id}/edit${paramsSuffix}`}>
									<Edit2Icon className="h-3.5 w-3.5" />
								</Link>
							</Button>
						</div>
						<div className="space-y-2">
							<div className="flex items-center justify-between text-sm">
								<span className="text-slate-500">Participant Type</span>
								<Badge variant="secondary" className="bg-blue-50 text-blue-700">
									{general.participantType}
								</Badge>
							</div>
							<div className="flex items-center justify-between text-sm">
								<span className="text-slate-500">Meetings</span>
								{meetings && meetings.length > 0 ? (
									<Badge
										variant="secondary"
										className="bg-emerald-50 text-emerald-700"
									>
										{meetings.map(m => m.name).join(', ')}
									</Badge>
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
									<div className="mt-4 flex items-center justify-between rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-3 text-sm">
										<div className="flex items-center gap-3">
											<CircleDashedIcon className="h-5 w-5 text-slate-500" />
											<div>
												<span className="font-medium text-slate-700">
													{nextStep.name}
												</span>
												<span className="ml-2 text-slate-500">
													({nextStep.action})
												</span>
											</div>
										</div>
										<div className="text-right text-xs text-slate-600">
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
							</div>
						)}
					</CardContent>
				</Card>
			</div>
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
