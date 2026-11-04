import { RequestStatus } from '@prisma/client'
import { LoaderFunctionArgs } from '@remix-run/node'
import archiver from 'archiver'
import { PassThrough } from 'stream'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { getFile } from '~/utils/storage.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const url = new URL(request.url)
	const selectedIds = url.searchParams.get('selectedIds')
	const countryId = url.searchParams.get('countryId')
	const nationalityId = url.searchParams.get('nationalityId')
	const status = url.searchParams.get('status')
	const participantTypeId = url.searchParams.get('participantTypeId')
	const organization = url.searchParams.get('organization')

	// Build where clause - prioritize selectedIds if present
	let photoWhereClause: Record<string, unknown> = { documentType: 'PHOTO' }

	if (selectedIds) {
		const ids = selectedIds.split(',').filter(Boolean)
		photoWhereClause = {
			documentType: 'PHOTO',
			participantId: { in: ids },
		}
	} else {
		// Build where clause based on filters
		const participantWhere: Record<string, string | RequestStatus> = {}
		if (countryId && countryId !== 'all') {
			participantWhere.countryId = countryId
		}
		if (nationalityId && nationalityId !== 'all') {
			participantWhere.nationalityId = nationalityId
		}
		if (status && status !== 'all') {
			participantWhere.status = status as RequestStatus
		}
		if (participantTypeId && participantTypeId !== 'all') {
			participantWhere.participantTypeId = participantTypeId
		}
		if (organization && organization !== 'all') {
			participantWhere.organization = organization
		}

		if (Object.keys(participantWhere).length > 0) {
			photoWhereClause = {
				documentType: 'PHOTO',
				participant: participantWhere,
			}
		}
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
		return new Response('No photos found matching the criteria', {
			status: 404,
			headers: {
				'content-type': 'text/plain',
			},
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
