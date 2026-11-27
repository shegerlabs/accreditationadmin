import ExcelJS from 'exceljs'
import { type ExportParticipant } from '~/utils/participant-export.server'

// Modelled on the security screening template: red bold headers above the
// rows. Either a workbook per organisation, each with the template's "Company
// Name" block across rows 1-2, or everyone on one sheet without that block.

type Column = {
	header: string
	width: number
	value: (p: ExportParticipant) => string | Date | null
	date?: boolean
}

const columns: Column[] = [
	{ header: 'Family Name/ Surname', width: 24, value: p => p.familyName },
	{ header: 'Full First Name', width: 22, value: p => p.firstName },
	{ header: 'Initials', width: 9, value: p => initials(p.firstName) },
	{ header: 'Title', width: 9, value: p => p.title?.name ?? '' },
	{ header: 'Organisation', width: 28, value: p => p.organization },
	{ header: 'Function', width: 24, value: p => p.jobTitle },
	{ header: 'Gender', width: 10, value: p => p.gender },
	{ header: 'Nationality', width: 18, value: p => p.nationality?.name ?? '' },
	{ header: 'Passport Number', width: 20, value: p => p.passportNumber },
	{ header: 'Date of Birth', width: 14, value: p => p.dateOfBirth, date: true },
	// The portal doesn't ask for the issuing country; a passport is normally
	// issued by the holder's country of nationality.
	{
		header: 'Country of Issue',
		width: 18,
		value: p => p.nationality?.name ?? '',
	},
	{
		header: 'Passport Expiry Date',
		width: 16,
		value: p => p.passportExpiry,
		date: true,
	},
	{ header: 'Email', width: 30, value: p => p.email ?? '' },
	{ header: 'Mobile', width: 18, value: p => p.telephone ?? '' },
	{
		header: 'Address',
		width: 40,
		value: p => [p.address, p.city, p.country?.name].filter(Boolean).join(', '),
	},
	{ header: 'Category', width: 22, value: p => p.participantType?.name ?? '' },
	{ header: 'Registration Code', width: 20, value: p => p.registrationCode },
]

const red = { argb: 'FFFF0000' }
const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } }
const thick = { style: 'thick' as const }

function initials(firstName: string) {
	return firstName
		.split(/[\s-]+/)
		.filter(Boolean)
		.map(name => name[0].toUpperCase())
		.join('')
}

/** Excel sheet names: at most 31 characters, none of []:*?/\, unique. */
function sheetName(organization: string, used: Set<string>) {
	const base =
		organization
			.replace(/[[\]:*?/\\]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 31)
			.trim() || 'No organisation'
	let name = base
	for (let n = 2; used.has(name.toLowerCase()); n++) {
		const suffix = ` (${n})`
		name = base.slice(0, 31 - suffix.length) + suffix
	}
	used.add(name.toLowerCase())
	return name
}

function addScreeningSheet(
	workbook: ExcelJS.Workbook,
	name: string,
	organization: string | null,
	participants: ExportParticipant[],
) {
	const headerRowNumber = organization === null ? 1 : 3
	const sheet = workbook.addWorksheet(name, {
		views: [{ state: 'frozen', ySplit: headerRowNumber }],
		pageSetup: {
			paperSize: 9,
			orientation: 'landscape',
			fitToPage: true,
			fitToWidth: 1,
			fitToHeight: 0,
		},
	})
	sheet.columns = columns.map(c => ({ width: c.width }))

	if (organization !== null) {
		sheet.mergeCells('A1:A2')
		sheet.mergeCells('B1:E2')
		const label = sheet.getCell('A1')
		label.value = 'Company Name'
		label.font = { name: 'Times New Roman', size: 16, bold: true, color: red }
		const company = sheet.getCell('B1')
		company.value = organization
		company.font = { name: 'Arial', size: 14, bold: true }
		for (const cell of [label, company]) {
			cell.alignment = {
				vertical: 'middle',
				horizontal: 'center',
				wrapText: true,
			}
			cell.border = { top: thick, left: thick, bottom: thick, right: thick }
		}
		sheet.getRow(1).height = 24
		sheet.getRow(2).height = 24
	}

	const headerRow = sheet.getRow(headerRowNumber)
	headerRow.height = 43.5
	columns.forEach((column, index) => {
		const cell = headerRow.getCell(index + 1)
		cell.value = column.header
		cell.font = { name: 'Arial', size: 11, bold: true, color: red }
		cell.alignment = {
			vertical: 'middle',
			horizontal: 'center',
			wrapText: true,
		}
		cell.border = { top: thin, left: thin, bottom: thin, right: thin }
	})

	for (const participant of participants) {
		const row = sheet.addRow(columns.map(column => column.value(participant)))
		row.font = { name: 'Arial', size: 10 }
		columns.forEach((column, index) => {
			const cell = row.getCell(index + 1)
			cell.border = { top: thin, left: thin, bottom: thin, right: thin }
			cell.alignment = { vertical: 'middle', wrapText: true }
			if (column.date) cell.numFmt = 'dd/mm/yyyy'
		})
	}

	sheet.autoFilter = {
		from: { row: headerRowNumber, column: 1 },
		to: { row: headerRowNumber, column: columns.length },
	}
}

function groupByOrganisation(participants: ExportParticipant[]) {
	const byOrganisation = new Map<string, ExportParticipant[]>()
	for (const participant of participants) {
		const key = participant.organization.trim()
		byOrganisation.set(key, [...(byOrganisation.get(key) ?? []), participant])
	}
	return [...byOrganisation.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function newWorkbook() {
	const workbook = new ExcelJS.Workbook()
	workbook.created = new Date()
	return workbook
}

/** One workbook with everyone on a single sheet, ordered by organisation. */
export async function createScreeningWorkbook(
	participants: ExportParticipant[],
) {
	const workbook = newWorkbook()
	addScreeningSheet(
		workbook,
		'Screening list',
		null,
		groupByOrganisation(participants).flatMap(([, members]) => members),
	)
	return Buffer.from(await workbook.xlsx.writeBuffer())
}

/** File names: no characters Windows or macOS reject, unique ignoring case. */
function fileName(organization: string, used: Set<string>) {
	const base =
		organization
			.replace(/[<>:"/\\|?*]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.replace(/^\.+|\.+$/g, '')
			.slice(0, 100)
			.trim() || 'No organisation'
	let name = base
	for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`
	used.add(name.toLowerCase())
	return `${name}.xlsx`
}

/** A separate workbook per organisation, each with a single sheet. */
export async function createScreeningWorkbooks(
	participants: ExportParticipant[],
) {
	const used = new Set<string>()
	const files: { name: string; content: Buffer }[] = []
	for (const [organization, members] of groupByOrganisation(participants)) {
		const workbook = newWorkbook()
		addScreeningSheet(
			workbook,
			sheetName(organization, new Set()),
			organization,
			members,
		)
		files.push({
			name: fileName(organization, used),
			content: Buffer.from(await workbook.xlsx.writeBuffer()),
		})
	}
	return files
}
