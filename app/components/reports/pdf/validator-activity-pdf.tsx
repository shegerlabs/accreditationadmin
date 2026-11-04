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
})

type ValidatorActivityData = {
	summary: {
		totalValidators: number
		totalActions: number
	}
	validatorActivity: Array<{
		name: string
		actions: Record<string, number>
		total: number
	}>
}

type ValidatorActivityPdfProps = {
	data: ValidatorActivityData
	filters?: {
		eventName?: string
		validatorName?: string
		startDate?: string
		endDate?: string
	}
}

export function ValidatorActivityPdf({
	data,
	filters,
}: ValidatorActivityPdfProps) {
	const filterDescription = buildFilterDescription(filters)

	const avgActionsPerValidator =
		data.summary.totalValidators > 0
			? Math.round(data.summary.totalActions / data.summary.totalValidators)
			: 0

	return (
		<ReportDocument
			title="Validator Activity Report"
			subtitle={filterDescription}
		>
			<PdfKpiGrid
				cards={[
					{ label: 'Active Validators', value: data.summary.totalValidators.toString() },
					{ label: 'Total Actions', value: data.summary.totalActions.toLocaleString() },
					{ label: 'Avg Actions/Validator', value: avgActionsPerValidator.toString() },
				]}
			/>

			<PdfSection title="Validator Workload">
				<PdfTable
					columns={[
						{ key: 'name', header: 'Validator', width: '25%' },
						{ key: 'total', header: 'Total', width: '12%' },
						{ key: 'approve', header: 'Approve', width: '12%' },
						{ key: 'reject', header: 'Reject', width: '12%' },
						{ key: 'print', header: 'Print', width: '12%' },
						{ key: 'collect', header: 'Collect', width: '12%' },
						{ key: 'bypass', header: 'Bypass', width: '12%' },
					]}
					data={data.validatorActivity.slice(0, 20).map(v => ({
						name: v.name,
						total: v.total,
						approve: v.actions['APPROVE'] ?? 0,
						reject: v.actions['REJECT'] ?? 0,
						print: v.actions['PRINT'] ?? 0,
						collect: v.actions['COLLECT'] ?? 0,
						bypass: v.actions['BYPASS'] ?? 0,
					}))}
				/>
			</PdfSection>
		</ReportDocument>
	)
}

function buildFilterDescription(
	filters?: ValidatorActivityPdfProps['filters'],
): string {
	if (!filters) return ''

	const parts: string[] = []
	if (filters.eventName) parts.push(`Event: ${filters.eventName}`)
	if (filters.validatorName) parts.push(`Validator: ${filters.validatorName}`)
	if (filters.startDate && filters.endDate)
		parts.push(`Period: ${filters.startDate} - ${filters.endDate}`)

	return parts.join(' | ')
}
