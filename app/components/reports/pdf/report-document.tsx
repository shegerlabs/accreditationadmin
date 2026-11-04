import {
	Document,
	Page,
	StyleSheet,
	Text,
	View,
} from '@react-pdf/renderer'
import { format } from 'date-fns'
import { ReactNode } from 'react'

// App color palette (converted from HSL CSS variables)
const colors = {
	primary: '#3f7a52', // HSL(134, 29%, 35%) - forest green
	primaryLight: '#4a9160', // lighter variant
	primaryDark: '#2d5a3c', // darker variant
	foreground: '#09090b', // HSL(240, 10%, 3.9%)
	muted: '#f4f4f5', // HSL(240, 4.8%, 95.9%)
	mutedForeground: '#71717a', // HSL(240, 3.8%, 46.1%)
	border: '#e4e4e7', // HSL(240, 5.9%, 90%)
	background: '#ffffff',
	card: '#ffffff',
}

const styles = StyleSheet.create({
	page: {
		padding: 40,
		paddingBottom: 60, // Extra padding for footer
		fontSize: 10,
		fontFamily: 'Helvetica',
	},
	pageLandscape: {
		padding: 30,
		paddingBottom: 50, // Extra padding for footer
		fontSize: 9,
		fontFamily: 'Helvetica',
	},
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		marginBottom: 20,
		paddingBottom: 10,
		borderBottomWidth: 2,
		borderBottomColor: colors.primary,
	},
	headerLeft: {
		flexDirection: 'column',
	},
	title: {
		fontSize: 20,
		fontFamily: 'Helvetica-Bold',
		marginBottom: 4,
		color: colors.primaryDark,
	},
	subtitle: {
		fontSize: 10,
		color: colors.mutedForeground,
	},
	headerRight: {
		flexDirection: 'column',
		alignItems: 'flex-end',
	},
	date: {
		fontSize: 9,
		color: colors.mutedForeground,
	},
	section: {
		marginBottom: 20,
	},
	sectionTitle: {
		fontSize: 12,
		fontFamily: 'Helvetica-Bold',
		marginBottom: 10,
		paddingBottom: 4,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
		color: colors.foreground,
	},
	table: {
		display: 'flex',
		flexDirection: 'column',
		width: '100%',
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 4,
	},
	tableRow: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
		minHeight: 22,
	},
	tableRowEven: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
		backgroundColor: colors.muted,
		minHeight: 22,
	},
	tableHeader: {
		flexDirection: 'row',
		backgroundColor: colors.primary,
		borderTopLeftRadius: 3,
		borderTopRightRadius: 3,
		minHeight: 26,
	},
	tableCell: {
		padding: 5,
		paddingVertical: 6,
		fontSize: 8,
		borderRightWidth: 1,
		borderRightColor: colors.border,
		justifyContent: 'center',
	},
	tableCellLast: {
		padding: 5,
		paddingVertical: 6,
		fontSize: 8,
		justifyContent: 'center',
	},
	tableHeaderCell: {
		padding: 5,
		paddingVertical: 6,
		fontSize: 8,
		fontFamily: 'Helvetica-Bold',
		color: '#ffffff',
		borderRightWidth: 1,
		borderRightColor: colors.primaryLight,
		justifyContent: 'center',
	},
	tableHeaderCellLast: {
		padding: 5,
		paddingVertical: 6,
		fontSize: 8,
		fontFamily: 'Helvetica-Bold',
		color: '#ffffff',
		justifyContent: 'center',
	},
	footer: {
		position: 'absolute',
		bottom: 20,
		left: 40,
		right: 40,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		borderTopWidth: 1,
		borderTopColor: colors.border,
		paddingTop: 8,
		fontSize: 8,
		color: colors.mutedForeground,
	},
	footerLandscape: {
		position: 'absolute',
		bottom: 15,
		left: 30,
		right: 30,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		borderTopWidth: 1,
		borderTopColor: colors.border,
		paddingTop: 8,
		fontSize: 8,
		color: colors.mutedForeground,
	},
	kpiGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 10,
		marginBottom: 20,
	},
	kpiCard: {
		width: '23%',
		padding: 12,
		backgroundColor: colors.muted,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 6,
		borderLeftWidth: 4,
		borderLeftColor: colors.primary,
	},
	kpiLabel: {
		fontSize: 8,
		color: colors.mutedForeground,
		marginBottom: 4,
		textTransform: 'uppercase',
	},
	kpiValue: {
		fontSize: 18,
		fontFamily: 'Helvetica-Bold',
		color: colors.primaryDark,
	},
})

type ReportDocumentProps = {
	title: string
	subtitle?: string
	children: ReactNode
	orientation?: 'portrait' | 'landscape'
}

export function ReportDocument({
	title,
	subtitle,
	children,
	orientation = 'portrait',
}: ReportDocumentProps) {
	const generatedAt = format(new Date(), 'MMMM dd, yyyy HH:mm')
	const isLandscape = orientation === 'landscape'

	return (
		<Document title={title}>
			<Page
				size="A4"
				orientation={orientation}
				style={isLandscape ? styles.pageLandscape : styles.page}
			>
				<View style={styles.header}>
					<View style={styles.headerLeft}>
						<Text style={styles.title}>{title}</Text>
						{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
					</View>
					<View style={styles.headerRight}>
						<Text style={styles.date}>Generated: {generatedAt}</Text>
					</View>
				</View>

				{children}

				<View style={isLandscape ? styles.footerLandscape : styles.footer} fixed>
					<Text>Accreditation Admin</Text>
					<Text
						render={({ pageNumber, totalPages }) =>
							`Page ${pageNumber} of ${totalPages}`
						}
					/>
				</View>
			</Page>
		</Document>
	)
}

type KpiCardData = {
	label: string
	value: string | number
}

export function PdfKpiGrid({ cards }: { cards: KpiCardData[] }) {
	return (
		<View style={styles.kpiGrid}>
			{cards.map((card, index) => (
				<View key={index} style={styles.kpiCard}>
					<Text style={styles.kpiLabel}>{card.label}</Text>
					<Text style={styles.kpiValue}>{card.value}</Text>
				</View>
			))}
		</View>
	)
}

type TableColumn = {
	key: string
	header: string
	width: string
}

type PdfTableProps = {
	columns: TableColumn[]
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data: Array<Record<string, any>>
}

export function PdfTable({ columns, data }: PdfTableProps) {
	return (
		<View style={styles.table}>
			{/* Header Row */}
			<View style={styles.tableHeader}>
				{columns.map((col, colIndex) => (
					<Text
						key={col.key}
						style={[
							colIndex === columns.length - 1
								? styles.tableHeaderCellLast
								: styles.tableHeaderCell,
							{ width: col.width },
						]}
					>
						{col.header}
					</Text>
				))}
			</View>
			{/* Data Rows with alternating colors */}
			{data.map((row, rowIndex) => (
				<View
					key={rowIndex}
					style={rowIndex % 2 === 0 ? styles.tableRow : styles.tableRowEven}
					wrap={false}
				>
					{columns.map((col, colIndex) => (
						<Text
							key={col.key}
							style={[
								colIndex === columns.length - 1
									? styles.tableCellLast
									: styles.tableCell,
								{ width: col.width },
							]}
						>
							{String(row[col.key] ?? '')}
						</Text>
					))}
				</View>
			))}
		</View>
	)
}

export function PdfSection({
	title,
	children,
}: {
	title: string
	children: ReactNode
}) {
	return (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>{title}</Text>
			{children}
		</View>
	)
}

export { styles as pdfStyles }
