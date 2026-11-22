import { AuditAction, AuditEntityType } from '@prisma/client'
import { LoaderFunctionArgs } from '@remix-run/node'
import archiver from 'archiver'
import { PassThrough } from 'stream'
import { auditRequest } from '~/utils/audit.server'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import {
	backToParticipantList,
	exportFileDate,
	getExportParticipants,
} from '~/utils/participant-export.server'
import { participantExportWhere } from '~/utils/participant-filters.server'
import {
	createScreeningWorkbook,
	createScreeningWorkbooks,
} from '~/utils/screening-export.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const participants = await getExportParticipants(
		participantExportWhere(request, getTenantFilter(user)),
	)

	if (participants.length === 0) {
		return backToParticipantList(request, {
			title: 'Nothing to export',
			description: 'No participants match the current search and filters.',
		})
	}

	// ?files=separate: a ZIP with one workbook per organisation instead of
	// one workbook with a sheet per organisation.
	const separate = new URL(request.url).searchParams.get('files') === 'separate'

	if (separate) {
		const files = await createScreeningWorkbooks(participants)

		await auditRequest({
			request,
			action: AuditAction.EXPORT,
			entityType: AuditEntityType.PARTICIPANT,
			description: `Exported ${participants.length} participants to the screening list (${files.length} Excel files)`,
		})

		const archive = archiver('zip', { zlib: { level: 5 } })
		const passThrough = new PassThrough()
		archive.on('error', err => passThrough.destroy(err))
		archive.pipe(passThrough)
		for (const file of files) archive.append(file.content, { name: file.name })
		void archive.finalize()

		return new Response(passThrough as unknown as ReadableStream, {
			headers: {
				'content-type': 'application/zip',
				'content-disposition': `attachment; filename="screening-list_${exportFileDate()}.zip"`,
			},
		})
	}

	const workbook = await createScreeningWorkbook(participants)

	await auditRequest({
		request,
		action: AuditAction.EXPORT,
		entityType: AuditEntityType.PARTICIPANT,
		description: `Exported ${participants.length} participants to the screening list (Excel)`,
	})

	return new Response(workbook, {
		headers: {
			'content-type':
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="screening-list_${exportFileDate()}.xlsx"`,
		},
	})
}
