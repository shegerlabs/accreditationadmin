import type { RequestStatus } from '@prisma/client'
import { LoaderFunctionArgs } from '@remix-run/node'
import { format } from 'date-fns'
import React from 'react'
import { ParticipantSummaryPdf } from '~/components/reports/pdf/participant-summary-pdf'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import {
	createCsvResponse,
	createMultiSheetExcelResponse,
	createPdfResponse,
	ExportFormat,
} from '~/utils/report-export.server'
import { getParticipantSummaryData } from '~/utils/reports.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	const url = new URL(request.url)
	const formatParam = url.searchParams.get('format') as ExportFormat
	const eventIdParam = url.searchParams.get('eventId')
	const participantTypeIdParam = url.searchParams.get('participantTypeId')
	const countryIdParam = url.searchParams.get('countryId')
	const statusParam = url.searchParams.get('status') as RequestStatus | undefined
	const startDate = url.searchParams.get('startDate')
		? new Date(url.searchParams.get('startDate')!)
		: undefined
	const endDate = url.searchParams.get('endDate')
		? new Date(url.searchParams.get('endDate')!)
		: undefined

	// Filter out "all" values
	const eventId = eventIdParam && eventIdParam !== 'all' ? eventIdParam : undefined
	const participantTypeId = participantTypeIdParam && participantTypeIdParam !== 'all' ? participantTypeIdParam : undefined
	const countryId = countryIdParam && countryIdParam !== 'all' ? countryIdParam : undefined
	const status = statusParam && statusParam !== ('all' as never) ? statusParam : undefined

	const data = await getParticipantSummaryData(tenantFilter, {
		eventId,
		participantTypeId,
		countryId,
		status,
		startDate,
		endDate,
	})

	// Get filter names for display
	const [eventName, participantTypeName, countryName] = await Promise.all([
		eventId
			? prisma.event
					.findUnique({ where: { id: eventId }, select: { name: true } })
					.then(e => e?.name)
			: undefined,
		participantTypeId
			? prisma.participantType
					.findUnique({
						where: { id: participantTypeId },
						select: { name: true },
					})
					.then(pt => pt?.name)
			: undefined,
		countryId
			? prisma.country
					.findUnique({ where: { id: countryId }, select: { name: true } })
					.then(c => c?.name)
			: undefined,
	])

	const timestamp = format(new Date(), 'yyyy-MM-dd')
	const fileName = `participant-summary-${timestamp}`

	switch (formatParam) {
		case 'pdf': {
			const pdfDocument = React.createElement(ParticipantSummaryPdf, {
				data,
				filters: {
					eventName,
					participantTypeName,
					countryName,
					status,
					startDate: startDate ? format(startDate, 'MMM dd, yyyy') : undefined,
					endDate: endDate ? format(endDate, 'MMM dd, yyyy') : undefined,
				},
			})
			return createPdfResponse(pdfDocument, fileName)
		}

		case 'xlsx': {
			// Create summary sheet data
			const summaryData = [
				{ Metric: 'Total Participants', Value: data.summary.total },
				{ Metric: 'Printed', Value: data.summary.printed },
				{ Metric: 'Collected', Value: data.summary.collected },
				{ Metric: 'Rejected', Value: data.summary.rejected },
				{ Metric: 'Completion Rate', Value: `${data.summary.completionRate}%` },
				{ Metric: 'Rejection Rate', Value: `${data.summary.rejectionRate}%` },
				...data.summary.byStatus.map(s => ({
					Metric: `Status: ${s.status}`,
					Value: s.count,
				})),
			]

			// Create type breakdown sheet
			const typeData = data.summary.byType.map(t => ({
				'Participant Type': t.name,
				Count: t.count,
			}))

			// Create country breakdown sheet
			const countryData = data.summary.byCountry.map(c => ({
				Country: c.name,
				Count: c.count,
			}))

			// Create event breakdown sheet
			const eventData = data.summary.byEvent.map(e => ({
				Event: e.name,
				Count: e.count,
			}))

			// Create organization breakdown sheet
			const organizationData = data.summary.byOrganization.map(o => ({
				Organization: o.name,
				Count: o.count,
			}))

			// Create participants sheet
			const participantData = data.participants.map(p => ({
				'Registration Code': p.registrationCode,
				Name: p.name,
				Organization: p.organization,
				Type: p.type,
				Nationality: p.nationality,
				Event: p.event,
				Status: p.status,
				'Registration Date': p.createdAt,
			}))

			return createMultiSheetExcelResponse(
				[
					{ name: 'Summary', data: summaryData },
					{ name: 'By Type', data: typeData },
					{ name: 'By Event', data: eventData },
					{ name: 'By Organization', data: organizationData },
					{ name: 'By Country', data: countryData },
					{ name: 'Participants', data: participantData },
				],
				fileName,
			)
		}

		case 'csv': {
			const csvData = data.participants.map(p => ({
				'Registration Code': p.registrationCode,
				Name: p.name,
				Organization: p.organization,
				Type: p.type,
				Nationality: p.nationality,
				Event: p.event,
				Status: p.status,
				'Registration Date': p.createdAt,
			}))

			return createCsvResponse(csvData, fileName)
		}

		default:
			return new Response('Invalid format', { status: 400 })
	}
}
