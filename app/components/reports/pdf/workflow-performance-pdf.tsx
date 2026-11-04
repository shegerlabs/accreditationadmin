import { StyleSheet, Text, View } from '@react-pdf/renderer'
import {
	PdfKpiGrid,
	PdfSection,
	PdfTable,
	ReportDocument,
} from './report-document'

const styles = StyleSheet.create({
	summaryRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		paddingVertical: 4,
		borderBottomWidth: 1,
		borderBottomColor: '#f3f4f6',
	},
	summaryLabel: {
		fontSize: 9,
		color: '#374151',
	},
	summaryValue: {
		fontSize: 9,
		fontFamily: 'Helvetica-Bold',
	},
	slaCompliant: {
		color: '#059669',
	},
	slaViolation: {
		color: '#dc2626',
	},
})

type StepPerformance = {
	stepId: string
	stepName: string
	action: string
	workflowName: string
	approved: number
	rejected: number
	total: number
	approvalRate: number
	avgProcessingTimeMinutes: number
	slaCompliance: {
		target: number
		actual: number
		compliant: boolean
	} | null
}

type WorkflowPerformanceData = {
	summary: {
		totalActions: number
		overallApprovalRate: number
		stepsWithSla: number
	}
	stepPerformance: StepPerformance[]
	bottlenecks: StepPerformance[]
}

type WorkflowPerformancePdfProps = {
	data: WorkflowPerformanceData
	filters?: {
		eventName?: string
		startDate?: string
		endDate?: string
	}
}

export function WorkflowPerformancePdf({
	data,
	filters,
}: WorkflowPerformancePdfProps) {
	const filterDescription = buildFilterDescription(filters)

	return (
		<ReportDocument
			title="Workflow Performance Report"
			subtitle={filterDescription}
		>
			<PdfKpiGrid
				cards={[
					{ label: 'Total Actions', value: data.summary.totalActions.toLocaleString() },
					{ label: 'Approval Rate', value: `${data.summary.overallApprovalRate}%` },
					{ label: 'Steps with SLA', value: data.summary.stepsWithSla.toString() },
					{ label: 'Bottlenecks', value: data.bottlenecks.length.toString() },
				]}
			/>

			<PdfSection title="Bottlenecks (Longest Processing Times)">
				<PdfTable
					columns={[
						{ key: 'stepName', header: 'Step', width: '20%' },
						{ key: 'workflowName', header: 'Workflow', width: '20%' },
						{ key: 'action', header: 'Action', width: '12%' },
						{ key: 'avgProcessingTimeMinutes', header: 'Avg Time (min)', width: '15%' },
						{ key: 'total', header: 'Total', width: '10%' },
						{ key: 'approvalRate', header: 'Approval %', width: '12%' },
						{ key: 'slaStatus', header: 'SLA', width: '11%' },
					]}
					data={data.bottlenecks.map(step => ({
						...step,
						approvalRate: `${step.approvalRate}%`,
						slaStatus: step.slaCompliance
							? step.slaCompliance.compliant
								? 'OK'
								: 'Over'
							: 'N/A',
					}))}
				/>
			</PdfSection>

			<PdfSection title="Step Performance">
				<PdfTable
					columns={[
						{ key: 'stepName', header: 'Step', width: '18%' },
						{ key: 'workflowName', header: 'Workflow', width: '18%' },
						{ key: 'action', header: 'Action', width: '10%' },
						{ key: 'approved', header: 'Approved', width: '10%' },
						{ key: 'rejected', header: 'Rejected', width: '10%' },
						{ key: 'approvalRate', header: 'Rate', width: '8%' },
						{ key: 'avgProcessingTimeMinutes', header: 'Avg Time', width: '10%' },
						{ key: 'slaStatus', header: 'SLA', width: '8%' },
					]}
					data={data.stepPerformance.map(step => ({
						...step,
						approvalRate: `${step.approvalRate}%`,
						slaStatus: step.slaCompliance
							? step.slaCompliance.compliant
								? 'OK'
								: 'Over'
							: 'N/A',
					}))}
				/>
			</PdfSection>
		</ReportDocument>
	)
}

function buildFilterDescription(
	filters?: WorkflowPerformancePdfProps['filters'],
): string {
	if (!filters) return ''

	const parts: string[] = []
	if (filters.eventName) parts.push(`Event: ${filters.eventName}`)
	if (filters.startDate && filters.endDate)
		parts.push(`Period: ${filters.startDate} - ${filters.endDate}`)

	return parts.join(' | ')
}
