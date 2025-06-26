import { RequestStatus } from '@prisma/client'
import { LoaderFunctionArgs } from '@remix-run/node'
import * as XLSX from 'xlsx'
import { prisma } from '~/utils/db.server'

type WhereCondition = {
	participantTypeId?: string | null
	countryId?: string | null
	status?: string | null
}

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const searchParams = url.searchParams

	const conditions = []

	if (searchParams.get('participantTypeId') !== 'all') {
		conditions.push({
			participantTypeId: searchParams.get('participantTypeId'),
		})
	}
	if (searchParams.get('nationalityId') !== 'all') {
		conditions.push({ nationalityId: searchParams.get('nationalityId') })
	}
	if (searchParams.get('status') !== 'all') {
		conditions.push({ status: searchParams.get('status') })
	}
	if (searchParams.get('organization') !== 'all') {
		conditions.push({ organization: searchParams.get('organization') })
	}
	if (searchParams.get('wishList') !== 'all') {
		conditions.push({ wishList: searchParams.get('wishList') })
	}
	if (searchParams.get('invitationId') !== 'all') {
		conditions.push({ invitationId: searchParams.get('invitationId') })
	}
	if (searchParams.get('restrictionId') !== 'all') {
		conditions.push({ restrictionId: searchParams.get('restrictionId') })
	}

	const participants = await prisma.participant.findMany({
		where:
			conditions.length > 0
				? {
						AND: conditions.map(condition => ({
							...(condition.participantTypeId && {
								participantTypeId: condition.participantTypeId,
							}),
							...(condition.nationalityId && {
								nationalityId: condition.nationalityId,
							}),
							...(condition.status && {
								status: condition.status as RequestStatus,
							}),
							...(condition.organization && {
								organization: condition.organization,
							}),
							...(condition.wishList && {
								wishList: {
									contains: condition.wishList,
								},
							}),
							...(condition.invitationId && {
								invitationId: condition.invitationId,
							}),
							...(condition.restrictionId && {
								invitation: {
									restrictionId: condition.restrictionId,
								},
							}),
						})),
					}
				: undefined,
		orderBy: {
			firstName: 'asc',
		},
		select: {
			title: true,
			firstName: true,
			familyName: true,
			gender: true,
			dateOfBirth: true,
			passportNumber: true,
			email: true,
			organization: true,
			jobTitle: true,
			nationality: {
				select: { name: true },
			},
			participantType: {
				select: { name: true },
			},
		},
	})

	// Create a new workbook and worksheet
	const workbook = XLSX.utils.book_new()
	const worksheet = XLSX.utils.json_to_sheet(
		participants.map((participant, index) => ({
			'No.': index + 1,
			Nationality: participant.nationality?.name ?? 'Unknown',
			Organization: participant.organization ?? 'Unknown',
			Title: participant.title,
			'First Name': participant.firstName,
			'Family Name': participant.familyName,
			'Job Title': participant.jobTitle ?? 'Unknown',
			Gender: participant.gender,
			DateOfBirth: participant.dateOfBirth,
			PassportNumber: participant.passportNumber,
			Email: participant.email,
			ParticipantType: participant.participantType?.name ?? 'Unknown',
		})),
	)

	// Add the worksheet to the workbook
	XLSX.utils.book_append_sheet(workbook, worksheet, 'Participants')

	// Generate Excel file buffer
	const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

	return new Response(excelBuffer, {
		headers: {
			'content-type':
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="participants.xlsx"`,
		},
	})
}
