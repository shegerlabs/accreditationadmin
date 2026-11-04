import { useSearchParams } from '@remix-run/react'
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'

type ExportFormat = 'pdf' | 'xlsx' | 'csv'

type ExportDropdownProps = {
	reportType: string
	disabled?: boolean
}

export function ExportDropdown({ reportType, disabled }: ExportDropdownProps) {
	const [searchParams] = useSearchParams()

	const handleExport = (format: ExportFormat) => {
		const params = new URLSearchParams(searchParams)
		params.set('format', format)
		const url = `/admin/resources/reports/${reportType}?${params.toString()}`
		window.open(url, '_blank')
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="sm" disabled={disabled}>
					<Download className="mr-2 h-4 w-4" />
					Export
					<ChevronDown className="ml-2 h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => handleExport('pdf')}>
					<FileText className="mr-2 h-4 w-4" />
					Export as PDF
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => handleExport('xlsx')}>
					<FileSpreadsheet className="mr-2 h-4 w-4" />
					Export as Excel
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => handleExport('csv')}>
					<FileSpreadsheet className="mr-2 h-4 w-4" />
					Export as CSV
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
