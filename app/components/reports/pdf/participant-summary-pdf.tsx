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
})

type ParticipantSummaryData = {
	summary: {
		total: number
		printed: number
		collected: number
		rejected: number
		completionRate: number
		rejectionRate: number
		byStatus: Array<{ status: string; count: number }>
		byType: Array<{ name: string; count: number }>
		byCountry: Array<{ name: string; count: number }>
		byEvent: Array<{ name: string; count: number }>
		byOrganization: Array<{ name: string; count: number }>
	}
	trends: Array<{ date: string; count: number }>
	participants: Array<{
		id: string
		registrationCode: string
		name: string
		organization: string
		status: string
		type: string
		nationality: string
		event: string
		createdAt: string
	}>
}

type ParticipantSummaryPdfProps = {
	data: ParticipantSummaryData
	filters?: {
		eventName?: string
		participantTypeName?: string
		countryName?: string
		status?: string
		startDate?: string
		endDate?: string
	}
}

export function ParticipantSummaryPdf({
	data,
	filters,
}: ParticipantSummaryPdfProps) {
	const filterDescription = buildFilterDescription(filters)

	return (
		<ReportDocument
			title="Participant Summary Report"
			subtitle={filterDescription}
		>
			<PdfKpiGrid
				cards={[
					{ label: 'Total Participants', value: data.summary.total.toLocaleString() },
					{ label: 'Printed', value: data.summary.printed.toLocaleString() },
					{ label: 'Collected', value: data.summary.collected.toLocaleString() },
					{ label: 'Completion Rate', value: `${data.summary.completionRate}%` },
				]}
			/>

			<View style={styles.twoColumn}>
				<View style={styles.column}>
					<PdfSection title="By Status">
						{data.summary.byStatus.map((item, index) => (
							<View key={index} style={styles.summaryRow}>
								<Text style={styles.summaryLabel}>{item.status}</Text>
								<Text style={styles.summaryValue}>
									{item.count.toLocaleString()}
								</Text>
							</View>
						))}
					</PdfSection>
				</View>

				<View style={styles.column}>
					<PdfSection title="By Participant Type">
						{data.summary.byType.slice(0, 10).map((item, index) => (
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

			<View style={styles.twoColumn}>
				<View style={styles.column}>
					<PdfSection title="By Event">
						{data.summary.byEvent.slice(0, 10).map((item, index) => (
							<View key={index} style={styles.summaryRow}>
								<Text style={styles.summaryLabel}>{item.name}</Text>
								<Text style={styles.summaryValue}>
									{item.count.toLocaleString()}
								</Text>
							</View>
						))}
					</PdfSection>
				</View>

				<View style={styles.column}>
					<PdfSection title="Top Organizations">
						{data.summary.byOrganization.slice(0, 10).map((item, index) => (
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

			<PdfSection title="Top Countries">
				{data.summary.byCountry.slice(0, 15).map((item, index) => (
					<View key={index} style={styles.summaryRow}>
						<Text style={styles.summaryLabel}>{item.name}</Text>
						<Text style={styles.summaryValue}>
							{item.count.toLocaleString()}
						</Text>
					</View>
				))}
			</PdfSection>

			<PdfSection title="Recent Participants">
				<PdfTable
					columns={[
						{ key: 'registrationCode', header: 'Code', width: '12%' },
						{ key: 'name', header: 'Name', width: '18%' },
						{ key: 'organization', header: 'Organization', width: '18%' },
						{ key: 'type', header: 'Type', width: '15%' },
						{ key: 'nationality', header: 'Nationality', width: '15%' },
						{ key: 'status', header: 'Status', width: '10%' },
						{ key: 'createdAt', header: 'Date', width: '12%' },
					]}
					data={data.participants.slice(0, 50)}
				/>
			</PdfSection>
		</ReportDocument>
	)
}

function buildFilterDescription(
	filters?: ParticipantSummaryPdfProps['filters'],
): string {
	if (!filters) return ''

	const parts: string[] = []
	if (filters.eventName) parts.push(`Event: ${filters.eventName}`)
	if (filters.participantTypeName)
		parts.push(`Type: ${filters.participantTypeName}`)
	if (filters.countryName) parts.push(`Country: ${filters.countryName}`)
	if (filters.status) parts.push(`Status: ${filters.status}`)
	if (filters.startDate && filters.endDate)
		parts.push(`Period: ${filters.startDate} - ${filters.endDate}`)

	return parts.join(' | ')
}
