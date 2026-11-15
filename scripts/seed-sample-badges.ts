#!/usr/bin/env node
/**
 * Seeds sample participants at every workflow level of an event, for testing
 * boxes and badge printing locally:
 *
 *   each approval step (Request Received, Review, each validation level),
 *   Print Badge, printed (awaiting collection), collected, and rejected.
 *
 * Every participant type with a workflow in the event gets people at every
 * level, spread across sample parliament invitations, with some in closed
 * session. More than one print run's worth of MPs wait at Print Badge, so the
 * per-run cap shows. The PRINTER account gets print step access so its boxes
 * aren't empty.
 *
 * Re-runnable: it replaces only its own participants (registration codes
 * starting SMP-). Refuses to run against a non-local database.
 *
 *   npx tsx scripts/seed-sample-badges.ts [--event=<eventId>]
 */
import { PrismaClient, type RequestStatus } from '@prisma/client'

const prisma = new PrismaClient()
const CODE_PREFIX = 'SMP-'
const PRINTER = 'badgeprinter'

const PARLIAMENTS = [
	['Kenya', 'Parliament of Kenya'],
	['Nigeria', 'National Assembly of Nigeria'],
	['Ghana', 'Parliament of Ghana'],
	['Ethiopia', 'House of Peoples’ Representatives of Ethiopia'],
	['South Africa', 'Parliament of the Republic of South Africa'],
	['Senegal', 'Assemblée nationale du Sénégal'],
	['Egypt', 'House of Representatives of Egypt'],
	['Rwanda', 'Parliament of Rwanda'],
] as const

const FIRST_NAMES = [
	'Amina',
	'Kwame',
	'Thandiwe',
	'Youssef',
	'Fatou',
	'Tesfaye',
	'Grace',
	'Moussa',
	'Lindiwe',
	'Samuel',
	'Nomvula Gugulethu',
	'Émile',
	'Chidinma',
	'Abebe',
	'Zainab',
	'Olusegun',
	'Wanjiku',
	'Ibrahima',
	'Nadia',
	'Kofi',
	'Aïssatou',
	'Tendai',
	'Mariam',
	'Jean-Baptiste',
	'Esi',
	'Hassan',
	'Naledi',
	'Desta',
	'Yaw',
	'Rokia',
]
const FAMILY_NAMES = [
	'Abara',
	'Bekele',
	'Cissé',
	'Dlamini',
	'Eze',
	'Fofana',
	'Gueye',
	'Haile',
	'Ibekwe',
	'Juma',
	'Kamau',
	'Lungu',
	'Mensah',
	'Ndiaye',
	'Okonkwo',
	'Phiri',
	'Quaye',
	'Rakotomalala',
	'Sow',
	'Tadesse',
	'Uwimana',
	'Vilakazi',
	'Wanjiru',
	'Xaba',
	'Yeboah',
	'Zulu',
	'Mthembu-Dlamini',
	'Ölund',
	'Ba',
	'Nkurunziza',
]

type Level = {
	label: string
	stepId: string
	status: RequestStatus
	collected?: boolean
}

function argValue(name: string) {
	const arg = process.argv.find(a => a.startsWith(`--${name}=`))
	return arg?.slice(name.length + 3)
}

function assertLocalDatabase() {
	const url = process.env.DATABASE_URL ?? ''
	const host = url.match(/@([^:/?]+)/)?.[1]
	if (host !== 'localhost' && host !== '127.0.0.1')
		throw new Error(
			`Refusing to seed sample participants into a non-local database (${host ?? 'unknown host'}).`,
		)
}

async function main() {
	assertLocalDatabase()

	const eventId = argValue('event')
	const event = eventId
		? await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
		: await prisma.event.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })
	const focal = await prisma.user.findFirstOrThrow({
		where: { tenantId: event.tenantId, roles: { some: { name: 'focal' } } },
	})
	const [title, workflows, countries] = await Promise.all([
		prisma.title.findFirstOrThrow({ orderBy: { name: 'asc' } }),
		prisma.workflow.findMany({
			where: { eventId: event.id },
			include: {
				participantType: { select: { name: true } },
				steps: {
					include: { role: { select: { name: true } } },
					orderBy: { order: 'asc' },
				},
			},
		}),
		prisma.country.findMany({
			where: { name: { in: PARLIAMENTS.map(([country]) => country) } },
		}),
	])
	if (workflows.length === 0)
		throw new Error(`Event "${event.name}" has no workflows.`)
	const countryId = new Map(countries.map(c => [c.name, c.id]))

	console.log(`Event: ${event.name}`)

	const invitations = await Promise.all(
		PARLIAMENTS.map(([, organization]) =>
			prisma.invitation.upsert({
				where: {
					tenantId_eventId_organization_email: {
						tenantId: event.tenantId,
						eventId: event.id,
						organization,
						email: focal.email,
					},
				},
				update: {},
				create: {
					tenantId: event.tenantId,
					eventId: event.id,
					organization,
					name: organization,
					email: focal.email,
				},
			}),
		),
	)

	const removed = await prisma.participant.deleteMany({
		where: { eventId: event.id, registrationCode: { startsWith: CODE_PREFIX } },
	})
	if (removed.count)
		console.log(`Removed ${removed.count} earlier sample participants`)

	let n = 0
	for (const workflow of workflows) {
		const type = workflow.participantType.name
		const isMp = type === 'MP'
		const approveSteps = workflow.steps.filter(s => s.action === 'APPROVE')
		const printStep = workflow.steps.find(s => s.action === 'PRINT')
		const collectStep = workflow.steps.find(s => s.action === 'COLLECT')
		const rejectTarget = workflow.steps.find(s => s.isRejectionTarget)

		const levels: Array<Level & { count: number }> = [
			...approveSteps.map((s, i) => ({
				label: s.name,
				stepId: s.id,
				status: (i === 0 ? 'PENDING' : 'INPROGRESS') as RequestStatus,
				count: 6,
			})),
			...(printStep
				? [
						{
							label: printStep.name,
							stepId: printStep.id,
							status: 'INPROGRESS' as const,
							count: isMp ? 60 : 12,
						},
					]
				: []),
			...(collectStep
				? [
						{
							label: 'Printed, awaiting collection',
							stepId: collectStep.id,
							status: 'PRINTED' as const,
							count: 8,
						},
						{
							label: 'Collected',
							stepId: collectStep.id,
							status: 'COLLECTED' as const,
							collected: true,
							count: 4,
						},
					]
				: []),
			...(rejectTarget
				? [
						{
							label: 'Rejected',
							stepId: rejectTarget.id,
							status: 'REJECTED' as const,
							count: 3,
						},
					]
				: []),
		]

		for (const level of levels) {
			const data = Array.from({ length: level.count }, () => {
				const i = n++
				const [country, organization] = PARLIAMENTS[i % PARLIAMENTS.length]!
				const invitation = invitations[i % invitations.length]!
				const nationality = countryId.get(country) ?? countries[0]!.id
				const firstName = FIRST_NAMES[i % FIRST_NAMES.length]!
				const familyName = FAMILY_NAMES[(i * 7) % FAMILY_NAMES.length]!
				const code = `${CODE_PREFIX}${String(i + 1).padStart(4, '0')}`
				return {
					userId: focal.id,
					tenantId: event.tenantId,
					eventId: event.id,
					invitationId: isMp
						? invitation.id
						: i % 4 === 0
							? null
							: invitation.id,
					participantTypeId: workflow.participantTypeId,
					registrationCode: code,
					gender: i % 2 ? 'Male' : 'Female',
					titleId: title.id,
					firstName,
					familyName,
					dateOfBirth: new Date(1960 + (i % 35), i % 12, 1 + (i % 28)),
					nationalityId: nationality,
					passportNumber: `SMP${String(i + 1).padStart(6, '0')}`,
					passportExpiry: new Date(2031, 0, 1),
					organization: isMp ? organization : 'Pan-African News Agency',
					jobTitle: isMp ? 'Member of Parliament' : 'Journalist',
					countryId: nationality,
					city: country,
					email: `sample${i + 1}@example.com`,
					needsCarFromOrganizer: false,
					attendClosedSession: isMp && i % 3 === 0,
					status: level.status,
					stepId: level.stepId,
					...(level.collected && {
						collectedBy: `${firstName} ${familyName}`,
						collectedByPhone: '+27 11 000 0000',
						collectedAt: new Date(),
					}),
				}
			})
			await prisma.participant.createMany({ data })
			console.log(
				`  ${type.padEnd(6)} ${level.label.padEnd(30)} ${level.count}`,
			)
		}
	}

	// Print step access, so the printer's boxes have people ready to print.
	const printer = await prisma.user.findUnique({
		where: { username: PRINTER },
		select: { id: true },
	})
	let granted = 0
	for (const step of workflows.flatMap(w => w.steps)) {
		if (!printer || step.action !== 'PRINT') continue
		await prisma.userEventAccess.upsert({
			where: {
				userId_eventId_roleId_stepId: {
					userId: printer.id,
					eventId: event.id,
					roleId: step.roleId,
					stepId: step.id,
				},
			},
			update: {},
			create: {
				userId: printer.id,
				eventId: event.id,
				roleId: step.roleId,
				stepId: step.id,
			},
		})
		granted++
	}

	console.log(
		`\nSeeded ${n} sample participants across ${invitations.length} invitations`,
	)
	console.log(
		printer
			? `Print step access ensured for ${PRINTER} on ${granted} workflow(s)`
			: `No ${PRINTER} account, so no print step access was granted`,
	)
}

main()
	.catch(error => {
		console.error(error instanceof Error ? error.message : error)
		process.exitCode = 1
	})
	.finally(() => prisma.$disconnect())
