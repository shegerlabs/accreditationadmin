import {
	AlignmentType,
	BorderStyle,
	Document,
	Footer,
	Header,
	HeightRule,
	ImageRun,
	Packer,
	PageNumber,
	PageOrientation,
	Paragraph,
	ShadingType,
	Table,
	TableCell,
	TableLayoutType,
	TableRow,
	TextRun,
	VerticalAlign,
	WidthType,
} from 'docx'
import { imageSize } from 'image-size'
import {
	type ExportParticipant,
	formatExportDate,
} from '~/utils/participant-export.server'

// Modelled on the VIP offline processing template: A4 landscape, one table row
// per participant with their photo, and blank "for official purposes" columns
// for the card number and the signature on collection.

const font = 'Arial'
const official = 'D9D9D9'
const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }
const borders = { top: border, bottom: border, left: border, right: border }

// Twentieths of a point. A4 landscape is 16838 wide; margins are 1134 each.
const widths = {
	no: 500,
	firstNames: 1500,
	surname: 1500,
	dateOfBirth: 1200,
	nationality: 1400,
	gender: 900,
	passport: 1500,
	designation: 1800,
	photo: 1770,
	pin: 1200,
	signature: 1300,
}
const tableWidth = Object.values(widths).reduce((sum, w) => sum + w, 0)

// The photo box, in pixels at 96 dpi (about 3 x 3.7 cm).
const photoBox = { width: 112, height: 140 }

function text(value: string, options: { bold?: boolean; size?: number } = {}) {
	return new TextRun({
		text: value,
		font,
		bold: options.bold,
		size: options.size ?? 18,
	})
}

function cell(
	children: Array<TextRun | ImageRun>,
	width: number,
	options: {
		bold?: boolean
		shade?: boolean
		rowSpan?: number
		columnSpan?: number
	} = {},
) {
	return new TableCell({
		children: [new Paragraph({ alignment: AlignmentType.CENTER, children })],
		width: { size: width, type: WidthType.DXA },
		verticalAlign: VerticalAlign.CENTER,
		borders,
		rowSpan: options.rowSpan,
		columnSpan: options.columnSpan,
		shading: options.shade
			? { type: ShadingType.CLEAR, color: 'auto', fill: official }
			: undefined,
		margins: { top: 60, bottom: 60, left: 60, right: 60 },
	})
}

function headerCell(label: string, width: number, rowSpan = 2) {
	return cell([text(label, { bold: true })], width, { rowSpan })
}

function headerRows() {
	return [
		new TableRow({
			tableHeader: true,
			cantSplit: true,
			children: [
				headerCell('NO', widths.no),
				headerCell('FIRST NAMES', widths.firstNames),
				headerCell('SURNAME', widths.surname),
				headerCell('DATE OF BIRTH', widths.dateOfBirth),
				headerCell('NATIONALITY', widths.nationality),
				headerCell('GENDER', widths.gender),
				headerCell('PASSPORT NUMBER', widths.passport),
				headerCell('DESIGNATION / CATEGORY', widths.designation),
				headerCell('PHOTO', widths.photo),
				cell(
					[text('FOR OFFICIAL PURPOSES', { bold: true })],
					widths.pin + widths.signature,
					{
						columnSpan: 2,
						shade: true,
					},
				),
			],
		}),
		new TableRow({
			tableHeader: true,
			cantSplit: true,
			children: [
				cell([text('PIN NO / CARD NUMBER', { bold: true })], widths.pin, {
					shade: true,
				}),
				cell([text('SIGNATURE OF RECEIPT', { bold: true })], widths.signature, {
					shade: true,
				}),
			],
		}),
	]
}

function photoRun(photo: { data: Buffer; extension: string } | undefined) {
	if (!photo) return text('No photo', { size: 16 })
	const type =
		photo.extension === 'png'
			? 'png'
			: photo.extension.match(/^jpe?g$/)
				? 'jpg'
				: null
	if (!type) return text('No photo', { size: 16 })

	try {
		const { width, height } = imageSize(photo.data)
		const scale = Math.min(photoBox.width / width, photoBox.height / height)
		return new ImageRun({
			type,
			data: photo.data,
			transformation: {
				width: Math.round(width * scale),
				height: Math.round(height * scale),
			},
		})
	} catch {
		return text('No photo', { size: 16 })
	}
}

function participantRow(
	participant: ExportParticipant,
	index: number,
	photo: { data: Buffer; extension: string } | undefined,
) {
	// Job title, then category, without repeating them when they match.
	const designation = [
		...new Set(
			[participant.jobTitle, participant.participantType?.name]
				.map(value => value?.trim())
				.filter(Boolean),
		),
	].join(' / ')

	return new TableRow({
		cantSplit: true,
		height: { value: 2400, rule: HeightRule.ATLEAST },
		children: [
			cell([text(`${index + 1}.`)], widths.no),
			cell([text(participant.firstName)], widths.firstNames),
			cell([text(participant.familyName)], widths.surname),
			cell(
				[text(formatExportDate(participant.dateOfBirth))],
				widths.dateOfBirth,
			),
			cell([text(participant.nationality?.name ?? '')], widths.nationality),
			cell([text(participant.gender)], widths.gender),
			cell([text(participant.passportNumber)], widths.passport),
			cell([text(designation, { bold: true })], widths.designation),
			cell([photoRun(photo)], widths.photo),
			cell([], widths.pin),
			cell([], widths.signature),
		],
	})
}

export async function createVipDocument(
	participants: ExportParticipant[],
	photos: Map<string, { data: Buffer; extension: string }>,
) {
	const eventNames = [...new Set(participants.map(p => p.event.name))]
	const title = eventNames.join(' / ').toUpperCase() || 'ACCREDITATION'
	const generated = new Date().toISOString().slice(0, 16).replace('T', ' ')

	const document = new Document({
		creator: 'Accreditation',
		title: `${title} - Processing List`,
		sections: [
			{
				properties: {
					page: {
						size: {
							orientation: PageOrientation.LANDSCAPE,
							width: 11906,
							height: 16838,
						},
						margin: {
							top: 1134,
							right: 1134,
							bottom: 1134,
							left: 1134,
							header: 709,
							footer: 709,
						},
					},
				},
				headers: {
					default: new Header({
						children: [
							new Paragraph({
								alignment: AlignmentType.CENTER,
								children: [text(title, { bold: true, size: 24 })],
							}),
							new Paragraph({
								alignment: AlignmentType.CENTER,
								spacing: { after: 200 },
								children: [
									text('OFFLINE PROCESSING LIST', { bold: true, size: 24 }),
								],
							}),
						],
					}),
				},
				footers: {
					default: new Footer({
						children: [
							new Paragraph({
								children: [
									new TextRun({
										font,
										size: 16,
										children: [
											'Page ',
											PageNumber.CURRENT,
											' of ',
											PageNumber.TOTAL_PAGES,
										],
									}),
									new TextRun({
										font,
										size: 16,
										text: `\tGenerated ${generated} UTC`,
									}),
								],
								tabStops: [{ type: 'right', position: tableWidth }],
							}),
						],
					}),
				},
				children: [
					new Table({
						width: { size: tableWidth, type: WidthType.DXA },
						columnWidths: Object.values(widths),
						layout: TableLayoutType.FIXED,
						rows: [
							...headerRows(),
							...participants.map((participant, index) =>
								participantRow(participant, index, photos.get(participant.id)),
							),
						],
					}),
				],
			},
		],
	})

	return Packer.toBuffer(document)
}
