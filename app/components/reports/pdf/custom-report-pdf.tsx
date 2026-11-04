import { StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReportResult } from '~/utils/custom-report-types'
import { PdfSection, PdfTable, ReportDocument } from './report-document'

// App color palette (converted from HSL CSS variables)
const colors = {
	primary: '#3f7a52', // HSL(134, 29%, 35%) - forest green
	primaryLight: '#4a9160',
	primaryDark: '#2d5a3c',
	foreground: '#09090b',
	muted: '#f4f4f5',
	mutedForeground: '#71717a',
	border: '#e4e4e7',
	background: '#ffffff',
}

const styles = StyleSheet.create({
	filterContainer: {
		backgroundColor: colors.muted,
		padding: 12,
		borderRadius: 6,
		marginBottom: 15,
		borderWidth: 1,
		borderColor: colors.border,
	},
	filterGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	filterItem: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: colors.background,
		padding: 6,
		paddingHorizontal: 10,
		borderRadius: 4,
		borderWidth: 1,
		borderColor: colors.border,
	},
	filterLabel: {
		fontSize: 8,
		fontFamily: 'Helvetica-Bold',
		color: colors.mutedForeground,
		marginRight: 4,
	},
	filterValue: {
		fontSize: 8,
		color: colors.foreground,
	},
	summaryContainer: {
		flexDirection: 'row',
		gap: 12,
		marginBottom: 20,
	},
	summaryCard: {
		flex: 1,
		padding: 12,
		backgroundColor: colors.muted,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: colors.border,
		borderLeftWidth: 4,
		borderLeftColor: colors.primary,
		alignItems: 'center',
	},
	summaryLabel: {
		fontSize: 7,
		color: colors.mutedForeground,
		textTransform: 'uppercase',
		marginBottom: 4,
		letterSpacing: 0.5,
	},
	summaryValue: {
		fontSize: 16,
		fontFamily: 'Helvetica-Bold',
		color: colors.primaryDark,
	},
	noData: {
		padding: 30,
		textAlign: 'center',
		color: colors.mutedForeground,
		fontSize: 11,
		backgroundColor: colors.muted,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: colors.border,
	},
	tableInfo: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 8,
		paddingHorizontal: 4,
	},
	tableInfoText: {
		fontSize: 8,
		color: colors.mutedForeground,
	},
})

type CustomReportPdfProps = {
	reportName: string
	description?: string
	dataSource: string
	results: ReportResult
	filters?: Array<{ label: string; value: string }>
}

export function CustomReportPdf({
	reportName,
	description,
	dataSource,
	results,
	filters,
}: CustomReportPdfProps) {
	const columnCount = results.columns.length

	// Use landscape for reports with many columns (more than 5)
	const orientation = columnCount > 5 ? 'landscape' : 'portrait'

	// Calculate column widths based on orientation and column count
	const availableWidth = orientation === 'landscape' ? 100 : 100
	const minColWidth = orientation === 'landscape' ? 8 : 12
	const maxColWidth = orientation === 'landscape' ? 25 : 35

	// Distribute width evenly but respect min/max
	const evenWidth = availableWidth / columnCount
	const colWidth = Math.max(minColWidth, Math.min(maxColWidth, evenWidth))

	// Create table columns with calculated widths
	const tableColumns = results.columns.map((col, index) => {
		// Give first column slightly more space for identifiers
		let width = colWidth
		if (index === 0 && columnCount > 1) {
			width = Math.min(colWidth * 1.3, maxColWidth)
		}
		return {
			key: col.key,
			header: col.label,
			width: `${width}%`,
		}
	})

	return (
		<ReportDocument
			title={reportName}
			subtitle={description || `Custom Report - ${dataSource}`}
			orientation={orientation}
		>
			{/* Filters Section */}
			{filters && filters.length > 0 && (
				<View style={styles.filterContainer}>
					<Text
						style={{
							fontSize: 9,
							fontFamily: 'Helvetica-Bold',
							marginBottom: 8,
							color: colors.foreground,
						}}
					>
						Applied Filters
					</Text>
					<View style={styles.filterGrid}>
						{filters.map((filter, index) => (
							<View key={index} style={styles.filterItem}>
								<Text style={styles.filterLabel}>{filter.label}:</Text>
								<Text style={styles.filterValue}>{filter.value}</Text>
							</View>
						))}
					</View>
				</View>
			)}

			{/* Summary Cards */}
			<View style={styles.summaryContainer}>
				<View style={styles.summaryCard}>
					<Text style={styles.summaryLabel}>Data Source</Text>
					<Text style={styles.summaryValue}>{dataSource}</Text>
				</View>
				<View style={styles.summaryCard}>
					<Text style={styles.summaryLabel}>Total Records</Text>
					<Text style={styles.summaryValue}>
						{results.totalCount.toLocaleString()}
					</Text>
				</View>
				<View style={styles.summaryCard}>
					<Text style={styles.summaryLabel}>Columns</Text>
					<Text style={styles.summaryValue}>{results.columns.length}</Text>
				</View>
				<View style={styles.summaryCard}>
					<Text style={styles.summaryLabel}>Generated In</Text>
					<Text style={styles.summaryValue}>{results.executionTimeMs}ms</Text>
				</View>
			</View>

			{/* Data Table */}
			<PdfSection title="Report Data">
				{results.rows.length > 0 ? (
					<>
						<View style={styles.tableInfo}>
							<Text style={styles.tableInfoText}>
								Showing {results.rows.length} of {results.totalCount} records
							</Text>
							<Text style={styles.tableInfoText}>
								{columnCount} column{columnCount !== 1 ? 's' : ''}
							</Text>
						</View>
						<PdfTable columns={tableColumns} data={results.rows} />
					</>
				) : (
					<Text style={styles.noData}>
						No data matches the report criteria.
					</Text>
				)}
			</PdfSection>
		</ReportDocument>
	)
}
