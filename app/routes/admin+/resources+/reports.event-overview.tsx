import { LoaderFunctionArgs } from '@remix-run/node'
import { format } from 'date-fns'
import React from 'react'
import { EventOverviewPdf } from '~/components/reports/pdf/event-overview-pdf'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import {
	createCsvResponse,
	createMultiSheetExcelResponse,
	createPdfResponse,
	ExportFormat,
} from '~/utils/report-export.server'
import { getEventOverviewData } from '~/utils/reports.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	const url = new URL(request.url)
	const formatParam = url.searchParams.get('format') as ExportFormat
	const eventIdParam = url.searchParams.get('eventId')
	const startDate = url.searchParams.get('startDate')
		? new Date(url.searchParams.get('startDate')!)
		: undefined
	const endDate = url.searchParams.get('endDate')
		? new Date(url.searchParams.get('endDate')!)
		: undefined

	// Filter out "all" values
	const eventId = eventIdParam && eventIdParam !== 'all' ? eventIdParam : undefined

	if (!eventId) {
		return new Response('Event ID is required', { status: 400 })
	}

	const data = await getEventOverviewData(tenantFilter, {
		eventId,
		startDate,
		endDate,
	})

	if (!data.event) {
		return new Response('Event not found', { status: 404 })
	}

	const timestamp = format(new Date(), 'yyyy-MM-dd')
	const fileName = `event-overview-${data.event.name.replace(/\s+/g, '-')}-${timestamp}`

	switch (formatParam) {
		case 'pdf': {
			const pdfDocument = React.createElement(EventOverviewPdf, {
				data,
				filters: {
					startDate: startDate ? format(startDate, 'MMM dd, yyyy') : undefined,
					endDate: endDate ? format(endDate, 'MMM dd, yyyy') : undefined,
				},
			})
			return createPdfResponse(pdfDocument, fileName)
		}

		case 'xlsx': {
			// Create summary sheet data
			const summaryData = [
				{ Metric: 'Event Name', Value: data.event.name },
				{ Metric: 'Status', Value: data.event.status },
				{ Metric: 'Start Date', Value: data.event.startDate },
				{ Metric: 'End Date', Value: data.event.endDate },
				{ Metric: 'Registrations', Value: data.summary!.registrationCount },
				{ Metric: 'Quota Capacity', Value: data.summary!.quotaCapacity },
				{ Metric: 'Usage Percentage', Value: `${data.summary!.usagePercentage}%` },
			]

			// Create trends sheet
			const trendsData = data.trends.map(t => ({
				Date: t.date,
				Registrations: t.count,
			}))

			// Create type breakdown sheet
			const typeData = data.typeBreakdown.map(t => ({
				'Participant Type': t.name,
				Count: t.count,
			}))

			// Create stage distribution sheet
			const stageData = data.stageDistribution.map(s => ({
				Step: s.stepName,
				Action: s.action,
				Count: s.count,
			}))

			// Create invitation usage sheet
			const invitationData = data.invitationUsage.map(inv => ({
				Organization: inv.organization,
				Quota: inv.quota ?? 'N/A',
				Used: inv.used,
				Remaining: inv.remaining ?? 'N/A',
				'Usage %':
					inv.quota && inv.quota > 0
						? `${Math.round((inv.used / inv.quota) * 100)}%`
						: 'N/A',
			}))

			return createMultiSheetExcelResponse(
				[
					{ name: 'Summary', data: summaryData },
					{ name: 'Daily Trends', data: trendsData },
					{ name: 'By Type', data: typeData },
					{ name: 'By Stage', data: stageData },
					{ name: 'Invitation Usage', data: invitationData },
				],
				fileName,
			)
		}

		case 'csv': {
			// For CSV, export invitation usage as main data
			const csvData = data.invitationUsage.map(inv => ({
				Event: data.event!.name,
				Organization: inv.organization,
				Quota: inv.quota ?? 'N/A',
				Used: inv.used,
				Remaining: inv.remaining ?? 'N/A',
				'Usage %':
					inv.quota && inv.quota > 0
						? `${Math.round((inv.used / inv.quota) * 100)}%`
						: 'N/A',
			}))

			return createCsvResponse(csvData, fileName)
		}

		default:
			return new Response('Invalid format', { status: 400 })
	}
}
