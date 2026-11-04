import { type LoaderFunctionArgs } from '@remix-run/node'
import React from 'react'
import { CustomReportPdf } from '~/components/reports/pdf/custom-report-pdf'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import {
	executeCustomReport,
	executeGroupedReport,
} from '~/utils/custom-report-query.server'
import type { CustomReportConfig } from '~/utils/custom-report-types'
import { prisma } from '~/utils/db.server'
import {
	createCsvResponse,
	createExcelResponse,
	createPdfResponse,
	type ExportFormat,
} from '~/utils/report-export.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)
	const { reportId } = params

	if (!reportId) {
		throw new Response('Report ID required', { status: 400 })
	}

	const report = await prisma.customReport.findFirst({
		where: {
			id: reportId,
			...tenantFilter,
			OR: [{ isPublic: true }, { createdById: user.id }],
		},
	})

	if (!report) {
		throw new Response('Report not found', { status: 404 })
	}

	const url = new URL(request.url)
	const format = (url.searchParams.get('format') || 'xlsx') as ExportFormat

	const config = report.config as unknown as CustomReportConfig

	// Execute the full report (with max limit)
	const fullConfig = { ...config, limit: 1000 }
	const results =
		fullConfig.groupBy && fullConfig.groupBy.length > 0
			? await executeGroupedReport(fullConfig, tenantFilter)
			: await executeCustomReport(fullConfig, tenantFilter)

	// Generate filename
	const sanitizedName = report.name.replace(/[^a-zA-Z0-9-_]/g, '_')
	const timestamp = new Date().toISOString().split('T')[0]
	const fileName = `${sanitizedName}_${timestamp}`

	switch (format) {
		case 'pdf': {
			// Build filter summary for PDF
			const filters = config.filters.map((f) => ({
				label: f.field,
				value: `${f.operator} ${String(f.value)}`,
			}))

			const pdfDocument = React.createElement(CustomReportPdf, {
				reportName: report.name,
				description: report.description || undefined,
				dataSource: config.dataSource,
				results,
				filters: filters.length > 0 ? filters : undefined,
			})
			return createPdfResponse(pdfDocument, fileName)
		}

		case 'csv': {
			const exportData = results.rows.map((row) => {
				const exportRow: Record<string, unknown> = {}
				for (const col of results.columns) {
					exportRow[col.label] = row[col.key]
				}
				return exportRow
			})
			return createCsvResponse(exportData, fileName)
		}

		case 'xlsx':
		default: {
			const exportData = results.rows.map((row) => {
				const exportRow: Record<string, unknown> = {}
				for (const col of results.columns) {
					exportRow[col.label] = row[col.key]
				}
				return exportRow
			})
			return createExcelResponse(exportData, 'Report Data', fileName)
		}
	}
}
