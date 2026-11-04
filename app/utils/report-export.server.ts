import { renderToBuffer } from '@react-pdf/renderer'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export type ExportFormat = 'pdf' | 'xlsx' | 'csv'

export function createExcelResponse(
	data: Array<Record<string, unknown>>,
	sheetName: string,
	fileName: string,
) {
	const workbook = XLSX.utils.book_new()
	const worksheet = XLSX.utils.json_to_sheet(data)

	XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
	const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

	return new Response(excelBuffer, {
		headers: {
			'content-type':
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="${fileName}.xlsx"`,
		},
	})
}

export function createMultiSheetExcelResponse(
	sheets: Array<{
		name: string
		data: Array<Record<string, unknown>>
	}>,
	fileName: string,
) {
	const workbook = XLSX.utils.book_new()

	for (const sheet of sheets) {
		const worksheet = XLSX.utils.json_to_sheet(sheet.data)
		XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name)
	}

	const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

	return new Response(excelBuffer, {
		headers: {
			'content-type':
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="${fileName}.xlsx"`,
		},
	})
}

export function createCsvResponse(
	data: Array<Record<string, unknown>>,
	fileName: string,
) {
	const csv = Papa.unparse(data)
	// Add BOM for Excel compatibility with UTF-8
	const bom = '\uFEFF'
	const csvWithBom = bom + csv

	return new Response(csvWithBom, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${fileName}.csv"`,
		},
	})
}

export async function createPdfResponse(
	pdfDocument: React.ReactElement,
	fileName: string,
) {
	const pdfBuffer = await renderToBuffer(pdfDocument)

	return new Response(pdfBuffer, {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `attachment; filename="${fileName}.pdf"`,
		},
	})
}
