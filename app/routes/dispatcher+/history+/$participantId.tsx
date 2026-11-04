import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { format } from 'date-fns'
import { PackageCheck, User } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['dispatcher'])
	const { participantId } = params

	invariantResponse(participantId, 'Participant ID is required')

	// Verify user has collected this participant's badge (has COLLECT approval record)
	const hasApproval = await prisma.approval.findFirst({
		where: {
			participantId,
			userId: user.id,
			action: 'COLLECT',
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

	// Get collection history for this participant by this user (COLLECT actions only)
	const collectionHistory = await prisma.approval.findMany({
		where: {
			participantId,
			userId: user.id,
			action: 'COLLECT',
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

	return json({ participant, collectionHistory })
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
			return <Badge className="bg-green-600">Printed</Badge>
		case 'COLLECTED':
			return <Badge className="bg-green-600">Collected</Badge>
		default:
			return <Badge variant="outline">{status}</Badge>
	}
}

export default function HistoryParticipantViewRoute() {
	const { participant, collectionHistory } = useLoaderData<typeof loader>()
	const navigate = useNavigate()

	const photoUrl = participant.documents[0]
		? `/admin/resources/participants/${participant.documents[0].id}?mode=inline`
		: null

	return (
		<Dialog open onOpenChange={() => navigate('/dispatcher/history')}>
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

					{/* Collection History */}
					{collectionHistory.length > 0 && (
						<div>
							<p className="mb-3 text-sm font-medium">Your Collection History</p>
							<div className="space-y-2">
								{collectionHistory.map(collection => (
									<div
										key={collection.id}
										className="flex items-center justify-between rounded-md border px-4 py-3"
									>
										<div className="text-sm">
											<span className="font-medium">{collection.step.name}</span>
											<span className="ml-3 text-muted-foreground">
												{format(new Date(collection.createdAt), 'MMM d, yyyy h:mm a')}
											</span>
											{collection.remarks && (
												<p className="mt-1 italic text-muted-foreground">
													"{collection.remarks}"
												</p>
											)}
										</div>
										<Badge className="bg-green-600">
											<PackageCheck className="mr-1 h-3 w-3" />
											Collected
										</Badge>
									</div>
								))}
							</div>
						</div>
					)}

					<div className="flex justify-end pt-2">
						<Button
							variant="outline"
							onClick={() => navigate('/dispatcher/history')}
						>
							Close
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
