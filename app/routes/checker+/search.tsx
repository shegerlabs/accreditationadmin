import { json, LoaderFunctionArgs } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['checkpoint'])

	const url = new URL(request.url)
	const query = url.searchParams.get('q')?.trim()

	if (!query || query.length < 2) {
		return json({ results: [] } as const)
	}

	const participants = await prisma.participant.findMany({
		where: {
			OR: [
				{ registrationCode: { contains: query, mode: 'insensitive' } },
				{ firstName: { contains: query, mode: 'insensitive' } },
				{ familyName: { contains: query, mode: 'insensitive' } },
			],
			status: { in: ['PRINTED', 'COLLECTED'] },
		},
		select: {
			id: true,
			firstName: true,
			familyName: true,
			registrationCode: true,
			organization: true,
			participantType: { select: { name: true } },
			event: { select: { name: true } },
		},
		take: 10,
		orderBy: { familyName: 'asc' },
	})

	return json({
		results: participants.map(p => ({
			id: p.id,
			firstName: p.firstName,
			familyName: p.familyName,
			registrationCode: p.registrationCode,
			organization: p.organization,
			participantTypeName: p.participantType?.name ?? '',
			eventName: p.event.name,
		})),
	} as const)
}
