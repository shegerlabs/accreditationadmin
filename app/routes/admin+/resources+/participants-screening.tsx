import { AuditAction, AuditEntityType } from '@prisma/client'
import { LoaderFunctionArgs } from '@remix-run/node'
import { auditRequest } from '~/utils/audit.server'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import {
	backToParticipantList,
	exportFileDate,
	getExportParticipants,
} from '~/utils/participant-export.server'
import { participantExportWhere } from '~/utils/participant-filters.server'
import { createScreeningWorkbook } from '~/utils/screening-export.server'

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
