import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import { Form, Link, useLoaderData, useSearchParams } from '@remix-run/react'
import { format } from 'date-fns'
import {
	AlertTriangle,
	ArrowLeft,
	Briefcase,
	Calendar,
	FileText,
	Globe,
	Mail,
	MapPin,
	Phone,
	Trash2,
	User,
	Users,
} from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { getParticipantDocumentFileSrc, invariantResponse } from '~/utils/misc'
import { deleteDirectory } from '~/utils/storage.server'
import { redirectWithToast } from '~/utils/toast.server'

const ParticipantDeletePermanentlySchema = z.object({
	id: z.string(),
})

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		include: {
			documents: true,
			title: { select: { name: true } },
			country: { select: { name: true } },
			nationality: { select: { name: true } },
			participantType: { select: { name: true } },
			event: { select: { name: true } },
			tenant: { select: { name: true } },
			approvals: { select: { id: true } },
		},
	})

	invariantResponse(participant, 'Not Found', { status: 404 })
	invariantResponse(
		participant.deletedAt !== null,
		'Only soft-deleted participants can be permanently deleted. Please soft-delete first.',
		{ status: 400 },
	)

	const photo = participant.documents.find(doc => doc.documentType === 'PHOTO')

	return json({
		participant: {
			id: participant.id,
			registrationCode: participant.registrationCode,
			firstName: participant.firstName,
			familyName: participant.familyName,
			title: participant.title?.name ?? '',
			gender: participant.gender,
			email: participant.email,
			telephone: participant.telephone,
			organization: participant.organization,
			jobTitle: participant.jobTitle,
			city: participant.city,
			country: participant.country.name,
			nationality: participant.nationality.name,
			dateOfBirth: participant.dateOfBirth,
			passportNumber: participant.passportNumber,
			passportExpiry: participant.passportExpiry,
			participantType: participant.participantType.name,
			event: participant.event.name,
			tenant: participant.tenant.name,
			status: participant.status,
			createdAt: participant.createdAt,
			deletedAt: participant.deletedAt,
			documentCount: participant.documents.length,
			approvalCount: participant.approvals.length,
		},
		photoId: photo?.id,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin'])
	const url = new URL(request.url)
	const searchParams = url.searchParams

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: ParticipantDeletePermanentlySchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	// Verify the participant exists and is soft-deleted
	const participant = await prisma.participant.findUnique({
		where: { id: submission.value.id },
		select: {
			id: true,
			firstName: true,
			familyName: true,
			registrationCode: true,
			deletedAt: true,
		},
	})

	invariantResponse(participant, 'Participant not found', { status: 404 })
	invariantResponse(
		participant.deletedAt !== null,
		'Only soft-deleted participants can be permanently deleted',
		{ status: 400 },
	)

	// Delete files from Azure Blob Storage
	try {
		await deleteDirectory({
			containerName: 'accreditation',
			directoryName: `participants/${participant.id}`,
		})
	} catch (error) {
		console.error('Failed to delete participant files from storage:', error)
		// Continue with database deletion even if storage deletion fails
	}

	// Permanently delete the participant (cascades to documents and approvals)
	await prisma.participant.delete({
		where: { id: submission.value.id },
	})

	await auditRequest({
		request,
		action: AuditAction.DELETE,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: submission.value.id,
		description: `Participant "${participant.firstName} ${participant.familyName}" (${participant.registrationCode}) permanently deleted`,
		userId: user.id,
	})

	const redirectUrl = `/admin/participants${searchParams.size ? '?' + searchParams.toString() : ''}`
	return redirectWithToast(redirectUrl, {
		type: 'success',
		title: `Participant Permanently Deleted`,
		description: `Participant and all associated data have been permanently removed.`,
	})
}

export default function DeleteParticipantPermanentlyRoute() {
	const { participant, photoId } = useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()
	const photoLink = getParticipantDocumentFileSrc(photoId ?? '')

	return (
		<div className="space-y-6">
			{/* Warning Card */}
			<Card className="border-destructive bg-destructive/10">
				<CardHeader>
					<div className="flex items-center gap-3">
						<div className="rounded-full bg-destructive/20 p-2">
							<Trash2 className="h-6 w-6 text-destructive" />
						</div>
						<div>
							<CardTitle className="text-destructive">
								Permanently Delete Participant
							</CardTitle>
							<CardDescription className="text-destructive/80">
								<strong>This action cannot be undone!</strong> The participant
								record, all {participant.documentCount} document(s), and{' '}
								{participant.approvalCount} approval record(s) will be
								permanently removed from the system.
							</CardDescription>
						</div>
					</div>
				</CardHeader>
			</Card>

			{/* Participant Info Card */}
			<Card>
				<CardHeader className="pb-4">
					<div className="flex items-start gap-4">
						<Avatar className="h-16 w-16 ring-2 ring-muted">
							<AvatarImage
								src={photoLink}
								alt={`${participant.firstName} ${participant.familyName}`}
							/>
							<AvatarFallback>
								{participant.firstName[0]}
								{participant.familyName[0]}
							</AvatarFallback>
						</Avatar>
						<div className="flex-1">
							<CardTitle className="text-xl">
								{participant.title} {participant.firstName}{' '}
								{participant.familyName}
							</CardTitle>
							<CardDescription className="mt-1">
								{participant.registrationCode} &bull; {participant.participantType}
							</CardDescription>
							<div className="mt-2 flex gap-2">
								<span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
									Soft Deleted
								</span>
								<span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
									Deleted: {format(new Date(participant.deletedAt!), 'PP')}
								</span>
							</div>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-6">
					{/* Personal Information */}
					<div>
						<h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
							<User className="h-4 w-4" />
							Personal Information
						</h3>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm md:grid-cols-4">
							<InfoItem label="Gender" value={participant.gender} />
							<InfoItem label="Nationality" value={participant.nationality} />
							<InfoItem
								label="Date of Birth"
								value={format(new Date(participant.dateOfBirth), 'PP')}
								icon={<Calendar className="h-3.5 w-3.5" />}
							/>
							<InfoItem
								label="Passport Number"
								value={participant.passportNumber}
								icon={<FileText className="h-3.5 w-3.5" />}
							/>
						</div>
					</div>

					{/* Professional Information */}
					<div>
						<h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
							<Briefcase className="h-4 w-4" />
							Professional Information
						</h3>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm md:grid-cols-4">
							<InfoItem
								label="Organization"
								value={participant.organization}
								icon={<Users className="h-3.5 w-3.5" />}
							/>
							<InfoItem label="Job Title" value={participant.jobTitle} />
							<InfoItem
								label="Email"
								value={participant.email ?? 'N/A'}
								icon={<Mail className="h-3.5 w-3.5" />}
							/>
							<InfoItem
								label="Telephone"
								value={participant.telephone ?? 'N/A'}
								icon={<Phone className="h-3.5 w-3.5" />}
							/>
						</div>
					</div>

					{/* Location & Event Information */}
					<div>
						<h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
							<MapPin className="h-4 w-4" />
							Location & Event
						</h3>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm md:grid-cols-4">
							<InfoItem label="City" value={participant.city} />
							<InfoItem
								label="Country"
								value={participant.country}
								icon={<Globe className="h-3.5 w-3.5" />}
							/>
							<InfoItem label="Event" value={participant.event} />
							<InfoItem
								label="Registered"
								value={format(new Date(participant.createdAt), 'PP')}
							/>
						</div>
					</div>

					{/* Data Summary */}
					<div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
						<h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
							<AlertTriangle className="h-4 w-4" />
							Data to be Deleted
						</h3>
						<ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
							<li>Participant record</li>
							<li>{participant.documentCount} document(s) including photos</li>
							<li>{participant.approvalCount} approval/workflow history record(s)</li>
							<li>All files stored in cloud storage</li>
						</ul>
					</div>
				</CardContent>
			</Card>

			{/* Action Buttons */}
			<div className="flex items-center justify-end gap-3">
				<Button variant="outline" asChild>
					<Link
						to={`/admin/participants${searchParams.size ? '?' + searchParams.toString() : ''}`}
					>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Cancel
					</Link>
				</Button>
				<Form method="POST">
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<input type="hidden" name="id" value={participant.id} />
					<Button type="submit" variant="destructive">
						<Trash2 className="mr-2 h-4 w-4" />
						Permanently Delete
					</Button>
				</Form>
			</div>
		</div>
	)
}

function InfoItem({
	label,
	value,
	icon,
}: {
	label: string
	value: string
	icon?: React.ReactNode
}) {
	return (
		<div>
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="mt-0.5 flex items-center gap-1.5 font-medium">
				{icon && <span className="text-muted-foreground">{icon}</span>}
				{value}
			</dd>
		</div>
	)
}
