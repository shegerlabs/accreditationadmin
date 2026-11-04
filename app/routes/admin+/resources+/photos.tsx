import { LoaderFunctionArgs } from '@remix-run/node'
import archiver from 'archiver'
import { PassThrough } from 'stream'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { backToParticipantList } from '~/utils/participant-export.server'
import { participantExportWhere } from '~/utils/participant-filters.server'
import { getFile } from '~/utils/storage.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)

	const url = new URL(request.url)
	const countryId = url.searchParams.get('countryId')
	const status = url.searchParams.get('status')
	const participantTypeId = url.searchParams.get('participantTypeId')

	// SECURITY: the same participants the list shows, limited to the user's
	// tenant (global admins see every tenant).
	const photoWhereClause = {
		documentType: 'PHOTO' as const,
		participant: participantExportWhere(request, getTenantFilter(user)),
	}

	// Fetch all photo documents matching filters
	const photos = await prisma.participantDocument.findMany({
		where: photoWhereClause,
		select: {
			id: true,
			fileName: true,
			extension: true,
			participantId: true,
			participant: {
				select: {
					firstName: true,
					familyName: true,
					registrationCode: true,
					country: { select: { code: true, name: true } },
					nationality: { select: { code: true, name: true } },
				},
			},
		},
	})

	if (photos.length === 0) {
		return backToParticipantList(request, {
			title: 'No photos to download',
			description: 'None of the participants matching the current filters have a photo.',
		})
	}

	// Create ZIP archive
	const archive = archiver('zip', { zlib: { level: 5 } })
	const passThrough = new PassThrough()

	// Handle archive errors
	archive.on('error', err => {
		console.error('Archive error:', err)
		passThrough.destroy(err)
	})

	archive.pipe(passThrough)

	// Add each photo to the archive
	for (const photo of photos) {
		try {
			const blobPath = `participants/${photo.participantId}/${photo.fileName}.${photo.extension}`
			const blob = await getFile({
				containerName: 'accreditation',
				fileName: blobPath,
			})

			// Organize by nationality folder (since participants page filters by nationality)
			const folderName = (photo.participant.nationality?.name ?? photo.participant.country?.name ?? 'UNKNOWN')
				.replace(/[^a-zA-Z0-9\s-]/g, '')
				.replace(/\s+/g, '_')
			const safeName = `${photo.participant.firstName} ${photo.participant.familyName}`.replace(
				/[^a-zA-Z0-9\s-]/g,
				'',
			)

			archive.append(blob, {
				name: `${folderName}/${safeName}.${photo.extension}`,
			})
		} catch (error) {
			console.error(`Failed to add photo ${photo.id} to archive:`, error)
			// Continue with other photos
		}
	}

	archive.finalize()

	// Generate filename based on filters
	const datePart = new Date().toISOString().split('T')[0]
	const filterParts: string[] = []
	if (countryId && countryId !== 'all') filterParts.push('country')
	if (status && status !== 'all') filterParts.push(status.toLowerCase())
	if (participantTypeId && participantTypeId !== 'all') filterParts.push('type')
	const filterSuffix = filterParts.length > 0 ? `_${filterParts.join('_')}` : ''
	const filename = `photos${filterSuffix}_${datePart}.zip`

	return new Response(passThrough as unknown as ReadableStream, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${filename}"`,
		},
	})
}
