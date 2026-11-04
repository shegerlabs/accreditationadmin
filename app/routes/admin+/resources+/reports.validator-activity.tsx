import { LoaderFunctionArgs } from '@remix-run/node'
import { format } from 'date-fns'
import React from 'react'
import { ValidatorActivityPdf } from '~/components/reports/pdf/validator-activity-pdf'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import {
	createCsvResponse,
	createMultiSheetExcelResponse,
	createPdfResponse,
	ExportFormat,
} from '~/utils/report-export.server'
import { getValidatorActivityData } from '~/utils/reports.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	const url = new URL(request.url)
	const formatParam = url.searchParams.get('format') as ExportFormat
	const eventId = url.searchParams.get('eventId') ?? undefined
	const userId = url.searchParams.get('userId') ?? undefined
	const startDate = url.searchParams.get('startDate')
		? new Date(url.searchParams.get('startDate')!)
		: undefined
	const endDate = url.searchParams.get('endDate')
		? new Date(url.searchParams.get('endDate')!)
		: undefined

	const data = await getValidatorActivityData(tenantFilter, {
		eventId,
		userId,
		startDate,
		endDate,
	})

	// Get filter names for display
	const [eventName, validatorName] = await Promise.all([
		eventId
			? prisma.event
					.findUnique({ where: { id: eventId }, select: { name: true } })
					.then(e => e?.name)
			: undefined,
		userId
			? prisma.user
					.findUnique({ where: { id: userId }, select: { name: true, username: true } })
					.then(u => u?.name ?? u?.username)
			: undefined,
	])

	const timestamp = format(new Date(), 'yyyy-MM-dd')
	const fileName = `validator-activity-${timestamp}`

	switch (formatParam) {
		case 'pdf': {
			const pdfDocument = React.createElement(ValidatorActivityPdf, {
				data,
				filters: {
					eventName,
					validatorName,
					startDate: startDate ? format(startDate, 'MMM dd, yyyy') : undefined,
					endDate: endDate ? format(endDate, 'MMM dd, yyyy') : undefined,
				},
			})
			return createPdfResponse(pdfDocument, fileName)
		}

		case 'xlsx': {
			// Create summary sheet data
			const summaryData = [
				{ Metric: 'Active Validators', Value: data.summary.totalValidators },
				{ Metric: 'Total Actions', Value: data.summary.totalActions },
				{
					Metric: 'Avg Actions per Validator',
					Value:
						data.summary.totalValidators > 0
							? Math.round(data.summary.totalActions / data.summary.totalValidators)
							: 0,
				},
			]

			// Create workload sheet
			const workloadData = data.validatorActivity.map(v => ({
				Validator: v.name,
				Total: v.total,
				Approve: v.actions['APPROVE'] ?? 0,
				Reject: v.actions['REJECT'] ?? 0,
				Print: v.actions['PRINT'] ?? 0,
				Collect: v.actions['COLLECT'] ?? 0,
				Bypass: v.actions['BYPASS'] ?? 0,
			}))

			return createMultiSheetExcelResponse(
				[
					{ name: 'Summary', data: summaryData },
					{ name: 'Workload', data: workloadData },
				],
				fileName,
			)
		}

		case 'csv': {
			// For CSV, export workload data
			const csvData = data.validatorActivity.map(v => ({
				Validator: v.name,
				Total: v.total,
				Approve: v.actions['APPROVE'] ?? 0,
				Reject: v.actions['REJECT'] ?? 0,
				Print: v.actions['PRINT'] ?? 0,
				Collect: v.actions['COLLECT'] ?? 0,
				Bypass: v.actions['BYPASS'] ?? 0,
			}))

			return createCsvResponse(csvData, fileName)
		}

		default:
			return new Response('Invalid format', { status: 400 })
	}
}
