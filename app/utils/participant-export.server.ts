import { Prisma } from '@prisma/client'
import { prisma } from '~/utils/db.server'
import { getFile } from '~/utils/storage.server'
import { redirectWithToast } from '~/utils/toast.server'

const exportSelect = {
	id: true,
	registrationCode: true,
	firstName: true,
	familyName: true,
	gender: true,
	dateOfBirth: true,
	passportNumber: true,
	passportExpiry: true,
	organization: true,
	jobTitle: true,
	email: true,
	telephone: true,
	address: true,
	city: true,
	title: { select: { name: true } },
	nationality: { select: { name: true } },
	country: { select: { name: true } },
	participantType: { select: { name: true } },
	event: { select: { name: true } },
	documents: {
		where: { documentType: 'PHOTO' },
		orderBy: { createdAt: 'desc' },
		take: 1,
		select: { fileName: true, extension: true },
	},
} satisfies Prisma.ParticipantSelect

export type ExportParticipant = Prisma.ParticipantGetPayload<{
	select: typeof exportSelect
}>

export function getExportParticipants(where: Prisma.ParticipantWhereInput) {
	return prisma.participant.findMany({
		where,
		orderBy: [
			{ organization: 'asc' },
			{ familyName: 'asc' },
			{ firstName: 'asc' },
		],
		select: exportSelect,
	})
}

/** dd/mm/yyyy. Dates of birth and expiry are stored as UTC midnight. */
export function formatExportDate(date: Date | null) {
	if (!date) return ''
	const day = String(date.getUTCDate()).padStart(2, '0')
	const month = String(date.getUTCMonth() + 1).padStart(2, '0')
	return `${day}/${month}/${date.getUTCFullYear()}`
}

export function exportFileDate() {
	return new Date().toISOString().split('T')[0]
}

/**
 * Downloads each participant's photo, a few at a time. A participant without
 * a photo, or whose download fails, is missing from the map.
 */
export async function getExportPhotos(participants: ExportParticipant[]) {
	const photos = new Map<string, { data: Buffer; extension: string }>()
	const queue = participants.filter(p => p.documents.length > 0)
	const concurrency = 6

	async function worker() {
		for (let p = queue.shift(); p; p = queue.shift()) {
			const { fileName, extension } = p.documents[0]
			try {
				const data = await getFile({
					containerName: 'accreditation',
					fileName: `participants/${p.id}/${fileName}.${extension}`,
				})
				photos.set(p.id, { data, extension: extension.toLowerCase() })
			} catch (error) {
				console.error(
					`Export: could not load photo for participant ${p.id}`,
					error,
				)
			}
		}
	}

	await Promise.all(Array.from({ length: concurrency }, worker))
	return photos
}

/**
 * Export links are plain downloads, so a failed export would otherwise replace
 * the app with a bare error page. Send the user back to the list they came
 * from, filters intact, with the reason in a toast.
 */
export function backToParticipantList(
	request: Request,
	toast: { title: string; description: string },
) {
	const url = new URL(request.url)
	url.searchParams.delete('selectedIds')
	const query = url.searchParams.toString()
	return redirectWithToast(`/admin/participants${query ? `?${query}` : ''}`, {
		type: 'error',
		...toast,
	})
}
