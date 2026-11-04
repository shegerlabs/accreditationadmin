// Simple table utility for CLI output

export interface TableColumn {
	header: string
	key: string
	width?: number
}

export function printTable(columns: TableColumn[], rows: Record<string, any>[]) {
	// Calculate column widths
	const widths = columns.map(col => {
		const headerLen = col.header.length
		const maxDataLen = rows.reduce((max, row) => {
			const val = String(row[col.key] ?? '')
			return Math.max(max, val.length)
		}, 0)
		return col.width || Math.max(headerLen, maxDataLen, 4)
	})

	// Truncate or pad string to width
	const formatCell = (value: any, width: number) => {
		const str = String(value ?? '')
		if (str.length > width) {
			return str.substring(0, width - 2) + '..'
		}
		return str.padEnd(width)
	}

	// Build separator line
	const separator = '  ' + widths.map(w => '─'.repeat(w)).join('──') + '  '

	// Print header
	console.log(separator)
	console.log(
		'  ' +
			columns.map((col, i) => formatCell(col.header, widths[i])).join('  ') +
			'  ',
	)
	console.log(separator)

	// Print rows
	if (rows.length === 0) {
		console.log('  No data found.')
	} else {
		for (const row of rows) {
			console.log(
				'  ' +
					columns.map((col, i) => formatCell(row[col.key], widths[i])).join('  ') +
					'  ',
			)
		}
	}
	console.log(separator)
}
