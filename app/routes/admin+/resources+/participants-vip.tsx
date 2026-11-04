import { AuditAction, AuditEntityType } from '@prisma/client'
import { LoaderFunctionArgs } from '@remix-run/node'
import { auditRequest } from '~/utils/audit.server'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import {
	backToParticipantList,
	exportFileDate,
	getExportParticipants,
	getExportPhotos,
} from '~/utils/participant-export.server'
import { participantExportWhere } from '~/utils/participant-filters.server'
import { createVipDocument } from '~/utils/vip-export.server'

// Each row embeds a photo, so the document is built in memory. Past this many
// rows, ask for a narrower filter instead of risking a slow, huge download.
const MAX_ROWS = 500

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
	if (participants.length > MAX_ROWS) {
		return backToParticipantList(request, {
			title: 'Too many participants for the Word list',
			description: `The current filters match ${participants.length} participants, and the Word list with photos is limited to ${MAX_ROWS}. Narrow the filters (for example by participant type) or select rows, then export again.`,
		})
	}

	const photos = await getExportPhotos(participants)
	const document = await createVipDocument(participants, photos)

	await auditRequest({
		request,
		action: AuditAction.EXPORT,
		entityType: AuditEntityType.PARTICIPANT,
		description: `Exported ${participants.length} participants to the VIP processing list (Word)`,
	})

	return new Response(document, {
		headers: {
			'content-type':
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'content-disposition': `attachment; filename="vip-list_${exportFileDate()}.docx"`,
		},
	})
}
