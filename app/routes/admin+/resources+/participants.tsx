import { RequestStatus } from '@prisma/client'
import { LoaderFunctionArgs } from '@remix-run/node'
import * as XLSX from 'xlsx'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

type ParticipantData = {
	title: { name: string } | null
	firstName: string
	familyName: string
	gender: string | null
	dateOfBirth: Date | null
	passportNumber: string | null
	email: string | null
	organization: string | null
	jobTitle: string | null
	nationality: { name: string } | null
	participantType: { name: string } | null
}

function createExcelResponse(participants: ParticipantData[]) {
	const workbook = XLSX.utils.book_new()
	const worksheet = XLSX.utils.json_to_sheet(
		participants.map((participant, index) => ({
			'No.': index + 1,
			Nationality: participant.nationality?.name ?? 'Unknown',
			Organization: participant.organization ?? 'Unknown',
			Title: participant.title?.name ?? '',
			'First Name': participant.firstName,
			'Family Name': participant.familyName,
			'Job Title': participant.jobTitle ?? 'Unknown',
			Gender: participant.gender,
			DateOfBirth: participant.dateOfBirth,
			PassportNumber: participant.passportNumber,
			Email: participant.email ?? '',
			ParticipantType: participant.participantType?.name ?? 'Unknown',
		})),
	)

	XLSX.utils.book_append_sheet(workbook, worksheet, 'Participants')
	const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

	return new Response(excelBuffer, {
		headers: {
			'content-type':
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="participants.xlsx"`,
		},
	})
}

export async function loader({ request }: LoaderFunctionArgs) {
	// SECURITY: Require tenant admin authentication
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)

	const url = new URL(request.url)
	const searchParams = url.searchParams

	// Check for selected IDs first - if present, export only those
	const selectedIds = searchParams.get('selectedIds')
	if (selectedIds) {
		const ids = selectedIds.split(',').filter(Boolean)
		const participants = await prisma.participant.findMany({
			where: {
				id: { in: ids },
				deletedAt: null,
				...tenantFilter, // SECURITY: Filter by tenant
			},
			orderBy: { firstName: 'asc' },
			select: {
				title: { select: { name: true } },
				firstName: true,
				familyName: true,
				gender: true,
				dateOfBirth: true,
				passportNumber: true,
				email: true,
				organization: true,
				jobTitle: true,
				nationality: { select: { name: true } },
				participantType: { select: { name: true } },
			},
		})

		return createExcelResponse(participants)
	}

	// Otherwise, use filters
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
		where: {
			...tenantFilter, // SECURITY: Filter by tenant
			deletedAt: null,
			...(conditions.length > 0 && {
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
			}),
		},
		orderBy: {
			firstName: 'asc',
		},
		select: {
			title: { select: { name: true } },
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

	return createExcelResponse(participants)
}
