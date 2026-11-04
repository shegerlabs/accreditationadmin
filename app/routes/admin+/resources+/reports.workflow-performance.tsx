import { LoaderFunctionArgs } from '@remix-run/node'
import { format } from 'date-fns'
import React from 'react'
import { WorkflowPerformancePdf } from '~/components/reports/pdf/workflow-performance-pdf'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import {
	createCsvResponse,
	createMultiSheetExcelResponse,
	createPdfResponse,
	ExportFormat,
} from '~/utils/report-export.server'
import { getWorkflowPerformanceData } from '~/utils/reports.server'

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

	const data = await getWorkflowPerformanceData(tenantFilter, {
		eventId,
		startDate,
		endDate,
	})

	// Get event name for display
	const eventName = eventId
		? await prisma.event
				.findUnique({ where: { id: eventId }, select: { name: true } })
				.then(e => e?.name)
		: undefined

	const timestamp = format(new Date(), 'yyyy-MM-dd')
	const fileName = `workflow-performance-${timestamp}`

	switch (formatParam) {
		case 'pdf': {
			const pdfDocument = React.createElement(WorkflowPerformancePdf, {
				data,
				filters: {
					eventName,
					startDate: startDate ? format(startDate, 'MMM dd, yyyy') : undefined,
					endDate: endDate ? format(endDate, 'MMM dd, yyyy') : undefined,
				},
			})
			return createPdfResponse(pdfDocument, fileName)
		}

		case 'xlsx': {
			// Create summary sheet data
			const summaryData = [
				{ Metric: 'Total Actions', Value: data.summary.totalActions },
				{ Metric: 'Overall Approval Rate', Value: `${data.summary.overallApprovalRate}%` },
				{ Metric: 'Steps with SLA', Value: data.summary.stepsWithSla },
			]

			// Create step performance sheet
			const stepData = data.stepPerformance.map(step => ({
				Step: step.stepName,
				Workflow: step.workflowName,
				Action: step.action,
				Approved: step.approved,
				Rejected: step.rejected,
				Total: step.total,
				'Approval Rate': `${step.approvalRate}%`,
				'Avg Processing Time (min)': step.avgProcessingTimeMinutes,
				'SLA Target (min)': step.slaCompliance?.target ?? 'N/A',
				'SLA Status': step.slaCompliance
					? step.slaCompliance.compliant
						? 'On Track'
						: 'Over'
					: 'No SLA',
			}))

			// Create bottlenecks sheet
			const bottleneckData = data.bottlenecks.map(step => ({
				Step: step.stepName,
				Workflow: step.workflowName,
				Action: step.action,
				'Avg Processing Time (min)': step.avgProcessingTimeMinutes,
				Total: step.total,
				'Approval Rate': `${step.approvalRate}%`,
			}))

			return createMultiSheetExcelResponse(
				[
					{ name: 'Summary', data: summaryData },
					{ name: 'Step Performance', data: stepData },
					{ name: 'Bottlenecks', data: bottleneckData },
				],
				fileName,
			)
		}

		case 'csv': {
			const csvData = data.stepPerformance.map(step => ({
				Step: step.stepName,
				Workflow: step.workflowName,
				Action: step.action,
				Approved: step.approved,
				Rejected: step.rejected,
				Total: step.total,
				'Approval Rate': `${step.approvalRate}%`,
				'Avg Processing Time (min)': step.avgProcessingTimeMinutes,
				'SLA Target (min)': step.slaCompliance?.target ?? 'N/A',
				'SLA Status': step.slaCompliance
					? step.slaCompliance.compliant
						? 'On Track'
						: 'Over'
					: 'No SLA',
			}))

			return createCsvResponse(csvData, fileName)
		}

		default:
			return new Response('Invalid format', { status: 400 })
	}
}
