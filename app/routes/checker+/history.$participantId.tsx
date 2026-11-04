import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import {
	AlertCircle,
	CheckCircle2,
	User,
} from 'lucide-react'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { getParticipantDocumentFileSrc } from '~/utils/misc'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['checkpoint'])
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		select: {
			id: true,
			firstName: true,
			familyName: true,
			gender: true,
			organization: true,
			jobTitle: true,
			registrationCode: true,
			status: true,
			email: true,
			telephone: true,
			attendClosedSession: true,
			attendExecutiveCouncilClosedSession: true,
			title: { select: { name: true } },
			country: { select: { name: true } },
			nationality: { select: { name: true } },
			participantType: { select: { name: true } },
			event: { select: { name: true } },
			documents: {
				where: { documentType: 'PHOTO' },
				select: { id: true },
				take: 1,
			},
		},
	})

	if (!participant) {
		throw new Response('Participant not found', { status: 404 })
	}

	return json({
		participant: {
			...participant,
			titleName: participant.title?.name ?? '',
			countryName: participant.country?.name ?? '',
			nationalityName: participant.nationality?.name ?? '',
			participantTypeName: participant.participantType?.name ?? '',
			eventName: participant.event.name,
			photoId: participant.documents[0]?.id ?? null,
		},
	})
}

export default function CheckerHistoryDetail() {
	const { participant } = useLoaderData<typeof loader>()
	const navigate = useNavigate()

	const handleClose = () => navigate('/checker/history', { preventScrollReset: true })

	const isValidStatus =
		participant.status === 'PRINTED' || participant.status === 'COLLECTED'

	return (
		<Dialog open onOpenChange={open => !open && handleClose()}>
			<DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Participant Details</DialogTitle>
				</DialogHeader>

				<div>
					{/* Status banner */}
					{isValidStatus ? (
						<div className="mb-4 flex items-center gap-2 rounded-lg border-2 border-green-500 bg-green-50 px-4 py-2.5 dark:bg-green-950/30">
							<CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
							<span className="text-sm font-semibold uppercase text-green-700 dark:text-green-400">
								Valid — {participant.status}
							</span>
						</div>
					) : (
						<div className="mb-4 flex items-center gap-2 rounded-lg border-2 border-red-500 bg-red-50 px-4 py-2.5 dark:bg-red-950/30">
							<AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
							<span className="text-sm font-semibold uppercase text-red-700 dark:text-red-400">
								Status: {participant.status}
							</span>
						</div>
					)}

					<div className="flex gap-4">
						{/* Photo */}
						<div className="h-48 w-36 shrink-0 overflow-hidden rounded-lg border-2 border-muted bg-muted shadow-sm md:h-56 md:w-44">
							{participant.photoId ? (
								<img
									src={getParticipantDocumentFileSrc(participant.photoId)}
									alt={`${participant.firstName} ${participant.familyName}`}
									className="h-full w-full object-cover"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center">
									<User className="h-14 w-14 text-muted-foreground" />
								</div>
							)}
						</div>

						{/* Details */}
						<div className="relative min-w-0 flex-1 space-y-1.5">
							{/* Session badge */}
							<span className="absolute right-0 top-0 rounded-2xl bg-red-600 px-5 py-3 text-3xl font-black leading-none text-white shadow-lg dark:bg-red-700">
								{participant.attendExecutiveCouncilClosedSession
									? 'CX'
									: participant.attendClosedSession
										? 'C'
										: 'O'}
							</span>

							<p className="text-lg font-bold">
								{participant.titleName && (
									<span className="text-muted-foreground">
										{participant.titleName}{' '}
									</span>
								)}
								{participant.firstName} {participant.familyName}
							</p>

							<dl className="space-y-1 text-sm">
								<div className="flex gap-1">
									<dt className="shrink-0 text-muted-foreground">Code:</dt>
									<dd className="font-medium">
										{participant.registrationCode}
									</dd>
								</div>
								<div className="flex gap-1">
									<dt className="shrink-0 text-muted-foreground">Type:</dt>
									<dd className="font-medium">
										{participant.participantTypeName}
									</dd>
								</div>
								{participant.jobTitle && (
									<div className="flex gap-1">
										<dt className="shrink-0 text-muted-foreground">
											Title:
										</dt>
										<dd className="font-medium">
											{participant.jobTitle}
										</dd>
									</div>
								)}
								{participant.organization && (
									<div className="flex gap-1">
										<dt className="shrink-0 text-muted-foreground">Org:</dt>
										<dd className="font-medium">
											{participant.organization}
										</dd>
									</div>
								)}
								{participant.countryName && (
									<div className="flex gap-1">
										<dt className="shrink-0 text-muted-foreground">
											Country:
										</dt>
										<dd className="font-medium">
											{participant.countryName}
										</dd>
									</div>
								)}
								{participant.nationalityName && (
									<div className="flex gap-1">
										<dt className="shrink-0 text-muted-foreground">
											Nationality:
										</dt>
										<dd className="font-medium">
											{participant.nationalityName}
										</dd>
									</div>
								)}
								<div className="flex gap-1">
									<dt className="shrink-0 text-muted-foreground">Event:</dt>
									<dd className="font-medium">{participant.eventName}</dd>
								</div>
								{participant.email && (
									<div className="flex gap-1">
										<dt className="shrink-0 text-muted-foreground">
											Email:
										</dt>
										<dd className="truncate font-medium">
											{participant.email}
										</dd>
									</div>
								)}
								{participant.telephone && (
									<div className="flex gap-1">
										<dt className="shrink-0 text-muted-foreground">
											Phone:
										</dt>
										<dd className="font-medium">
											{participant.telephone}
										</dd>
									</div>
								)}
							</dl>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
