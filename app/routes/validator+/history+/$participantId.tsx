import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { format } from 'date-fns'
import { CheckCircle, Clock, User, XCircle } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { requireUser } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUser(request)
	const { participantId } = params

	invariantResponse(participantId, 'Participant ID is required')

	// Verify user has processed this participant (has approval record)
	const hasApproval = await prisma.approval.findFirst({
		where: {
			participantId,
			userId: user.id,
		},
		select: { id: true },
	})

	invariantResponse(
		hasApproval,
		'You do not have permission to view this participant',
		{ status: 403 },
	)

	// Get participant details
	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		select: {
			id: true,
			registrationCode: true,
			title: { select: { name: true } },
			firstName: true,
			familyName: true,
			gender: true,
			email: true,
			telephone: true,
			organization: true,
			jobTitle: true,
			passportNumber: true,
			status: true,
			nationality: {
				select: { name: true },
			},
			country: {
				select: { name: true },
			},
			participantType: {
				select: { name: true },
			},
			event: {
				select: { name: true },
			},
			step: {
				select: { name: true },
			},
			documents: {
				where: { documentType: 'PHOTO' },
				select: { id: true },
				take: 1,
			},
		},
	})

	invariantResponse(participant, 'Participant not found', { status: 404 })

	// Get approval history for this participant by this user
	const approvals = await prisma.approval.findMany({
		where: {
			participantId,
			userId: user.id,
		},
		select: {
			id: true,
			action: true,
			result: true,
			remarks: true,
			createdAt: true,
			step: {
				select: { name: true },
			},
		},
		orderBy: { createdAt: 'desc' },
	})

	return json({ participant, approvals })
}

function getActionLabel(action: string) {
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

function getActionBadge(action: string) {
	const label = getActionLabel(action)
	switch (action) {
		case 'APPROVE':
			return (
				<Badge variant="default" className="bg-green-600">
					<CheckCircle className="mr-1 h-3 w-3" />
					{label}
				</Badge>
			)
		case 'REJECT':
			return (
				<Badge variant="destructive">
					<XCircle className="mr-1 h-3 w-3" />
					{label}
				</Badge>
			)
		case 'PRINT':
			return (
				<Badge className="bg-blue-600">
					<CheckCircle className="mr-1 h-3 w-3" />
					{label}
				</Badge>
			)
		case 'COLLECT':
			return (
				<Badge className="bg-emerald-600">
					<CheckCircle className="mr-1 h-3 w-3" />
					{label}
				</Badge>
			)
		case 'NOTIFY':
			return (
				<Badge variant="secondary">
					<CheckCircle className="mr-1 h-3 w-3" />
					{label}
				</Badge>
			)
		case 'ARCHIVE':
			return (
				<Badge variant="secondary">
					<CheckCircle className="mr-1 h-3 w-3" />
					{label}
				</Badge>
			)
		case 'BYPASS':
			return (
				<Badge variant="secondary">
					<Clock className="mr-1 h-3 w-3" />
					{label}
				</Badge>
			)
		default:
			return <Badge variant="outline">{label}</Badge>
	}
}

function getStatusBadge(status: string) {
	switch (status) {
		case 'APPROVED':
		case 'ARCHIVED':
			return <Badge className="bg-green-600">{status}</Badge>
		case 'REJECTED':
			return <Badge variant="destructive">{status}</Badge>
		case 'INPROGRESS':
			return <Badge variant="secondary">In Progress</Badge>
		case 'PRINTED':
			return <Badge className="bg-blue-600">Printed</Badge>
		default:
			return <Badge variant="outline">{status}</Badge>
	}
}

export default function HistoryParticipantViewRoute() {
	const { participant, approvals } = useLoaderData<typeof loader>()
	const navigate = useNavigate()

	const photoUrl = participant.documents[0]
		? `/admin/resources/participants/${participant.documents[0].id}?mode=inline`
		: null

	return (
		<Dialog open onOpenChange={() => navigate('/validator/history')}>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{participant.title?.name} {participant.firstName} {participant.familyName}
						{getStatusBadge(participant.status)}
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-5">
					{/* Photo and Basic Info */}
					<div className="flex gap-5">
						{photoUrl ? (
							<img
								src={photoUrl}
								alt={`${participant.firstName} ${participant.familyName}`}
								className="h-24 w-24 rounded-lg object-cover"
							/>
						) : (
							<div className="flex h-24 w-24 items-center justify-center rounded-lg bg-muted">
								<User className="h-10 w-10 text-muted-foreground" />
							</div>
						)}
						<div className="flex-1 space-y-1 text-sm">
							<p>
								<span className="text-muted-foreground">Code:</span>{' '}
								<span className="font-mono font-medium">{participant.registrationCode}</span>
							</p>
							<p>
								<span className="text-muted-foreground">Event:</span>{' '}
								{participant.event?.name}
							</p>
							<p>
								<span className="text-muted-foreground">Organization:</span>{' '}
								{participant.organization || 'N/A'}
							</p>
							<p>
								<span className="text-muted-foreground">Type:</span>{' '}
								{participant.participantType?.name}
							</p>
							<p>
								<span className="text-muted-foreground">Current Step:</span>{' '}
								{participant.step?.name}
							</p>
						</div>
					</div>

					{/* Details Grid */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
						<p>
							<span className="text-muted-foreground">Job Title:</span>{' '}
							{participant.jobTitle || 'N/A'}
						</p>
						<p>
							<span className="text-muted-foreground">Nationality:</span>{' '}
							{participant.nationality?.name || 'N/A'}
						</p>
						<p>
							<span className="text-muted-foreground">Country:</span>{' '}
							{participant.country?.name || 'N/A'}
						</p>
						<p>
							<span className="text-muted-foreground">Email:</span>{' '}
							{participant.email || 'N/A'}
						</p>
						<p>
							<span className="text-muted-foreground">Passport:</span>{' '}
							{participant.passportNumber || 'N/A'}
						</p>
						<p>
							<span className="text-muted-foreground">Gender:</span>{' '}
							{participant.gender || 'N/A'}
						</p>
					</div>

					{/* Your Actions */}
					{approvals.length > 0 && (
						<div>
							<p className="mb-3 text-sm font-medium">Your Actions</p>
							<div className="space-y-2">
								{approvals.map(approval => (
									<div
										key={approval.id}
										className="flex items-center justify-between rounded-md border px-4 py-3"
									>
										<div className="text-sm">
											<span className="font-medium">{approval.step.name}</span>
											<span className="ml-3 text-muted-foreground">
												{format(new Date(approval.createdAt), 'MMM d, yyyy h:mm a')}
											</span>
											{approval.remarks && (
												<p className="mt-1 italic text-muted-foreground">
													"{approval.remarks}"
												</p>
											)}
										</div>
										{getActionBadge(approval.action)}
									</div>
								))}
							</div>
						</div>
					)}

					<div className="flex justify-end pt-2">
						<Button
							variant="outline"
							onClick={() => navigate('/validator/history')}
						>
							Close
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
