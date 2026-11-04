import { LoaderFunctionArgs } from '@remix-run/node'
import { format } from 'date-fns'
import React from 'react'
import { InvitationUsagePdf } from '~/components/reports/pdf/invitation-usage-pdf'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import {
	createCsvResponse,
	createMultiSheetExcelResponse,
	createPdfResponse,
	ExportFormat,
} from '~/utils/report-export.server'
import { getInvitationUsageData } from '~/utils/reports.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	const url = new URL(request.url)
	const formatParam = url.searchParams.get('format') as ExportFormat
	const eventIdParam = url.searchParams.get('eventId')

	// Filter out "all" values
	const eventId = eventIdParam && eventIdParam !== 'all' ? eventIdParam : undefined

	const data = await getInvitationUsageData(tenantFilter, { eventId })

	// Get event name for display
	const eventName = eventId
		? await prisma.event
				.findUnique({ where: { id: eventId }, select: { name: true } })
				.then(e => e?.name)
		: undefined

	const timestamp = format(new Date(), 'yyyy-MM-dd')
	const fileName = `invitation-usage-${timestamp}`

	switch (formatParam) {
		case 'pdf': {
			const pdfDocument = React.createElement(InvitationUsagePdf, {
				data,
				filters: {
					eventName,
				},
			})
			return createPdfResponse(pdfDocument, fileName)
		}

		case 'xlsx': {
			// Create summary sheet data
			const summaryData = [
				{ Metric: 'Total Invitations', Value: data.summary.totalInvitations },
				{ Metric: 'Total Quota', Value: data.summary.hasUnlimitedQuotas ? 'Includes Unlimited' : data.summary.totalQuota },
				{ Metric: 'Total Used', Value: data.summary.totalUsed },
				{ Metric: 'Total Remaining', Value: data.summary.hasUnlimitedQuotas ? 'N/A' : data.summary.totalRemaining },
				{
					Metric: 'Overall Usage Percentage',
					Value: data.summary.hasUnlimitedQuotas ? 'N/A' : `${data.summary.overallUsagePercentage}%`,
				},
			]

			// Create invitation details sheet
			const invitationData = data.invitations.map(inv => {
				const isUnlimited = !inv.quota || inv.quota === 0
				return {
					Organization: inv.organization,
					'Participant Type': inv.participantType,
					'Access Level': inv.accessLevel,
					Quota: isUnlimited ? 'Unlimited' : inv.quota,
					Used: inv.used,
					Remaining: isUnlimited ? '-' : inv.remaining,
					'Usage %': isUnlimited ? '-' : `${inv.usagePercentage}%`,
				}
			})

			return createMultiSheetExcelResponse(
				[
					{ name: 'Summary', data: summaryData },
					{ name: 'Invitation Details', data: invitationData },
				],
				fileName,
			)
		}

		case 'csv': {
			const csvData = data.invitations.map(inv => {
				const isUnlimited = !inv.quota || inv.quota === 0
				return {
					Organization: inv.organization,
					'Participant Type': inv.participantType,
					'Access Level': inv.accessLevel,
					Quota: isUnlimited ? 'Unlimited' : inv.quota,
					Used: inv.used,
					Remaining: isUnlimited ? '-' : inv.remaining,
					'Usage %': isUnlimited ? '-' : `${inv.usagePercentage}%`,
				}
			})

			return createCsvResponse(csvData, fileName)
		}

		default:
			return new Response('Invalid format', { status: 400 })
	}
}
