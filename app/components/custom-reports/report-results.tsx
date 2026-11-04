import { Download, FileText, Loader2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/components/ui/table'
import type { ReportResult } from '~/utils/custom-report-types'

interface ReportResultsProps {
	results?: ReportResult
	isLoading?: boolean
	error?: string
	onExport?: (format: 'xlsx' | 'csv' | 'pdf') => void
	isExporting?: boolean
}

export function ReportResults({
	results,
	isLoading,
	error,
	onExport,
	isExporting,
}: ReportResultsProps) {
	if (isLoading) {
		return (
			<div className="flex items-center justify-center rounded-lg border p-12">
				<Loader2 className="mr-3 h-6 w-6 animate-spin" />
				<span className="text-muted-foreground">Running report...</span>
			</div>
		)
	}

	if (error) {
		return (
			<div className="rounded-lg border border-destructive bg-destructive/10 p-6">
				<h3 className="font-medium text-destructive">Error Running Report</h3>
				<p className="mt-2 text-sm text-destructive">{error}</p>
			</div>
		)
	}

	if (!results) {
		return (
			<div className="rounded-lg border border-dashed p-12 text-center">
				<p className="text-muted-foreground">
					Click "Run Report" to see results.
				</p>
			</div>
		)
	}

	if (results.rows.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-12 text-center">
				<p className="text-muted-foreground">
					No data matches your report criteria.
				</p>
			</div>
		)
	}

	return (
		<div className="space-y-4">
			{/* Results Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Badge variant="secondary">
						{results.totalCount.toLocaleString()} total rows
					</Badge>
					<Badge variant="outline">
						{results.rows.length} displayed
					</Badge>
					<span className="text-xs text-muted-foreground">
						Query completed in {results.executionTimeMs}ms
					</span>
				</div>

				{onExport && (
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => onExport('pdf')}
							disabled={isExporting}
						>
							{isExporting ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<FileText className="mr-2 h-4 w-4" />
							)}
							PDF
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => onExport('xlsx')}
							disabled={isExporting}
						>
							{isExporting ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Download className="mr-2 h-4 w-4" />
							)}
							Excel
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => onExport('csv')}
							disabled={isExporting}
						>
							{isExporting ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Download className="mr-2 h-4 w-4" />
							)}
							CSV
						</Button>
					</div>
				)}
			</div>

			{/* Results Table */}
			<div className="rounded-lg border">
				<div className="max-h-[600px] overflow-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-12 text-center">#</TableHead>
								{results.columns.map((col) => (
									<TableHead key={col.key} className="whitespace-nowrap">
										{col.label}
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{results.rows.map((row, rowIndex) => (
								<TableRow key={rowIndex}>
									<TableCell className="text-center text-muted-foreground">
										{rowIndex + 1}
									</TableCell>
									{results.columns.map((col) => (
										<TableCell
											key={col.key}
											className="max-w-[300px] truncate"
											title={String(row[col.key] ?? '')}
										>
											{formatCellValue(row[col.key], col.type)}
										</TableCell>
									))}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</div>

			{/* Truncation Notice */}
			{results.rows.length < results.totalCount && (
				<p className="text-center text-sm text-muted-foreground">
					Showing {results.rows.length} of {results.totalCount} rows.
					Export to get all data.
				</p>
			)}
		</div>
	)
}

function formatCellValue(value: unknown, type: string): React.ReactNode {
	if (value === null || value === undefined || value === '') {
		return <span className="text-muted-foreground">—</span>
	}

	switch (type) {
		case 'boolean':
			return value === true || value === 'true' || value === 'Yes' ? (
				<Badge variant="default" className="bg-green-500">
					Yes
				</Badge>
			) : (
				<Badge variant="secondary">No</Badge>
			)
		case 'number':
			return typeof value === 'number' ? value.toLocaleString() : String(value)
		default:
			return String(value)
	}
}
