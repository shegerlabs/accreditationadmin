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
	twoColumn: {
		flexDirection: 'row',
		gap: 20,
	},
	column: {
		width: '48%',
	},
	progressBar: {
		height: 8,
		backgroundColor: '#e5e7eb',
		borderRadius: 4,
		overflow: 'hidden',
		marginTop: 4,
	},
	progressFill: {
		height: '100%',
		backgroundColor: '#3b82f6',
	},
})

type EventOverviewData = {
	event: {
		id: string
		name: string
		status: string
		startDate: string
		endDate: string
	} | null
	summary: {
		registrationCount: number
		quotaCapacity: number
		usagePercentage: number
	} | null
	trends: Array<{ date: string; count: number }>
	typeBreakdown: Array<{ name: string; count: number }>
	stageDistribution: Array<{ stepName: string; action: string; count: number }>
	invitationUsage: Array<{
		organization: string
		quota: number | null
		used: number
		remaining: number | null
	}>
}

type EventOverviewPdfProps = {
	data: EventOverviewData
	filters?: {
		startDate?: string
		endDate?: string
	}
}

export function EventOverviewPdf({ data, filters }: EventOverviewPdfProps) {
	if (!data.event || !data.summary) {
		return (
			<ReportDocument title="Event Overview Report">
				<Text>No event selected</Text>
			</ReportDocument>
		)
	}

	const filterDescription = buildFilterDescription(data.event.name, filters)

	return (
		<ReportDocument title="Event Overview Report" subtitle={filterDescription}>
			<PdfKpiGrid
				cards={[
					{
						label: 'Registrations',
						value: data.summary.registrationCount.toLocaleString(),
					},
					{
						label: 'Quota Capacity',
						value: data.summary.quotaCapacity.toLocaleString(),
					},
					{ label: 'Usage', value: `${data.summary.usagePercentage}%` },
					{ label: 'Status', value: data.event.status },
				]}
			/>

			<View style={styles.twoColumn}>
				<View style={styles.column}>
					<PdfSection title="Event Details">
						<View style={styles.summaryRow}>
							<Text style={styles.summaryLabel}>Name</Text>
							<Text style={styles.summaryValue}>{data.event.name}</Text>
						</View>
						<View style={styles.summaryRow}>
							<Text style={styles.summaryLabel}>Status</Text>
							<Text style={styles.summaryValue}>{data.event.status}</Text>
						</View>
						<View style={styles.summaryRow}>
							<Text style={styles.summaryLabel}>Start Date</Text>
							<Text style={styles.summaryValue}>{data.event.startDate}</Text>
						</View>
						<View style={styles.summaryRow}>
							<Text style={styles.summaryLabel}>End Date</Text>
							<Text style={styles.summaryValue}>{data.event.endDate}</Text>
						</View>
					</PdfSection>
				</View>

				<View style={styles.column}>
					<PdfSection title="Participant Type Distribution">
						{data.typeBreakdown.slice(0, 8).map((item, index) => (
							<View key={index} style={styles.summaryRow}>
								<Text style={styles.summaryLabel}>{item.name}</Text>
								<Text style={styles.summaryValue}>
									{item.count.toLocaleString()}
								</Text>
							</View>
						))}
					</PdfSection>
				</View>
			</View>

			<PdfSection title="Workflow Stage Distribution">
				{data.stageDistribution.map((item, index) => (
					<View key={index} style={styles.summaryRow}>
						<Text style={styles.summaryLabel}>
							{item.stepName} ({item.action})
						</Text>
						<Text style={styles.summaryValue}>
							{item.count.toLocaleString()}
						</Text>
					</View>
				))}
			</PdfSection>

			<PdfSection title="Invitation Usage">
				<PdfTable
					columns={[
						{ key: 'organization', header: 'Organization', width: '35%' },
						{ key: 'quota', header: 'Quota', width: '15%' },
						{ key: 'used', header: 'Used', width: '15%' },
						{ key: 'remaining', header: 'Remaining', width: '15%' },
						{ key: 'usage', header: 'Usage %', width: '20%' },
					]}
					data={data.invitationUsage.slice(0, 20).map(inv => ({
						organization: inv.organization,
						quota: inv.quota?.toString() ?? 'N/A',
						used: inv.used,
						remaining: inv.remaining?.toString() ?? 'N/A',
						usage:
							inv.quota && inv.quota > 0
								? `${Math.round((inv.used / inv.quota) * 100)}%`
								: 'N/A',
					}))}
				/>
			</PdfSection>
		</ReportDocument>
	)
}

function buildFilterDescription(
	eventName: string,
	filters?: EventOverviewPdfProps['filters'],
): string {
	const parts: string[] = [`Event: ${eventName}`]

	if (filters?.startDate && filters?.endDate)
		parts.push(`Period: ${filters.startDate} - ${filters.endDate}`)

	return parts.join(' | ')
}
