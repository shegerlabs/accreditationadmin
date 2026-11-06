// setup-event.ts
// Reset the database and seed it for a new event belonging to a chosen organ.
//
// USAGE:
//   npm run setup-event                      # DRY RUN (default) - writes nothing
//   npm run setup-event -- --organ=pap       # DRY RUN, skipping the organ prompt
//   npm run setup-event -- --confirm         # Back up, then purge and seed
//
// WHAT IT ASKS, in order:
//   1. Which organ (scripts/profiles/) - tenant identity + participant types.
//   2. Whether losing the current participants and audit trail is acceptable.
//   3. The event details: name, location, dates, timezone, status.
//   4. How workflows should be built from the tenant's WorkflowTemplates.
//
// SAFETY:
//   - Dry run is the default; --confirm is required to write anything.
//   - The backup gate runs before the first write, every time.
//   - Purge and seed share one transaction, so a failure leaves nothing half-done.
//   - The Tenant ROW is updated in place, never deleted: User.tenantId cascades,
//     so dropping the tenant would delete every staff account with it.
//
// SPEC:
//   docs/superpowers/specs/2026-07-17-live-db-event-reset-design.md

import { PrismaClient, EventStatus, type Prisma } from '@prisma/client'
import prompts from 'prompts'
import {
	NON_WORKFLOW_PARTICIPANT_TYPES,
	createWorkflowFromTemplate,
} from '../app/utils/workflow-clone.server.js'
import { runBackupGate } from './lib/backup.js'
import { confirmDatabaseName } from './lib/confirm.js'
import {
	assertNoBlockingBackupRows,
	assertSchemaMatches,
	collectSurvey,
	printSurvey,
	purgeEventData,
} from './lib/purge.js'
import { describeTarget, printBanner } from './lib/target.js'
import { assertRetainedUsersExist } from './lib/users.js'
import { PROFILES, findProfile, type OrganProfile } from './profiles/index.js'
import { reportVerification, verifyPurge } from './lib/verify.js'

const prisma = new PrismaClient()

/** Interactive transactions default to 5s. The purge alone moves tens of
 *  thousands of rows, and the seed adds a few hundred more. */
const TRANSACTION_OPTIONS = { maxWait: 30_000, timeout: 600_000 }

/** Offered at the timezone prompt. Order matters: the profile's default is
 *  matched against this list to pick the initial selection. */
const TIMEZONES = [
	{ value: '+02:00', title: 'UTC+02:00 — SAST (Maseru, Johannesburg)' },
	{ value: '+03:00', title: 'UTC+03:00 — EAT (Addis Ababa, Nairobi)' },
	{ value: '+01:00', title: 'UTC+01:00 — WAT (Lagos, Algiers)' },
	{ value: '+00:00', title: 'UTC+00:00 — GMT (Accra, Abidjan)' },
] as const

interface EventPlan {
	name: string
	description: string
	status: EventStatus
	startDate: Date
	endDate: Date
	localStart: string
	localEnd: string
}

function cancelled(): never {
	console.log('\nCancelled. Nothing was changed.\n')
	process.exit(1)
}

function argValue(flag: string) {
	const hit = process.argv.find(a => a.startsWith(`${flag}=`))
	return hit?.slice(flag.length + 1)
}

/** Build a UTC Date from a local calendar date and an offset like '+02:00'. */
function atOffset(date: string, time: string, utcOffset: string) {
	const parsed = new Date(`${date}T${time}${utcOffset}`)
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(
			`Could not read "${date}T${time}${utcOffset}" as a date. ` +
				`Expected YYYY-MM-DD and an offset like +02:00.`,
		)
	}
	return parsed
}

async function pickProfile(): Promise<OrganProfile> {
	const flag = argValue('--organ')
	if (flag) {
		const profile = findProfile(flag)
		if (!profile) {
			throw new Error(
				`Unknown organ "${flag}". Known: ${PROFILES.map(p => p.key).join(', ')}.`,
			)
		}
		return profile
	}
	const { key } = await prompts({
		type: 'select',
		name: 'key',
		message: 'Which organ is this setup for?',
		choices: PROFILES.map(p => ({ title: p.label, value: p.key })),
	})
	if (!key) cancelled()
	return findProfile(key)!
}

/**
 * The history call, asked before anything else is decided: everything that
 * follows is wasted effort if the answer is no.
 */
async function confirmHistoryLoss(participants: number, auditLogs: number) {
	const { accepted } = await prompts({
		type: 'confirm',
		name: 'accepted',
		message:
			`This destroys ${participants} participant(s) and ${auditLogs} audit log(s), ` +
			`including the full approval trail. Is that acceptable?`,
		initial: false,
	})
	return accepted === true
}

async function askEventDetails(profile: OrganProfile): Promise<EventPlan> {
	const suggested = profile.suggestedEvent
	const answers = await prompts([
		{
			type: 'text',
			name: 'name',
			message: 'Event name',
			initial: suggested?.name ?? '',
			validate: (v: string) => (v.trim() ? true : 'Required'),
		},
		{
			type: 'text',
			name: 'description',
			message: 'Event description',
			initial: suggested?.description ?? '',
			validate: (v: string) => (v.trim() ? true : 'Required'),
		},
		{
			// Event has no location column, so this is folded into the description.
			type: 'text',
			name: 'location',
			message: 'Location (appended to the description)',
			initial: suggested?.location ?? '',
		},
		{
			type: 'text',
			name: 'startDate',
			message: 'Start date (YYYY-MM-DD, local to the event)',
			initial: suggested?.startDate ?? '',
			validate: (v: string) =>
				/^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? true : 'Use YYYY-MM-DD',
		},
		{
			type: 'text',
			name: 'endDate',
			message: 'End date (YYYY-MM-DD, local to the event)',
			initial: suggested?.endDate ?? '',
			validate: (v: string) =>
				/^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? true : 'Use YYYY-MM-DD',
		},
		{
			type: 'select',
			name: 'utcOffset',
			message: 'Event timezone',
			choices: TIMEZONES.map(tz => ({ title: tz.title, value: tz.value })),
			initial: Math.max(
				0,
				TIMEZONES.findIndex(
					tz => tz.value === (suggested?.utcOffset ?? '+02:00'),
				),
			),
		},
		{
			// Event.status has no default in the schema, so a value is required.
			type: 'select',
			name: 'status',
			message: 'Initial event status',
			choices: [
				{
					title: 'DRAFT — not yet open to registrants',
					value: EventStatus.DRAFT,
				},
				{
					title: 'PUBLISHED — open to registrants immediately',
					value: EventStatus.PUBLISHED,
				},
			],
			initial: 0,
		},
	])

	if (
		!answers.name ||
		!answers.startDate ||
		!answers.endDate ||
		!answers.utcOffset
	) {
		cancelled()
	}

	const startDate = atOffset(
		answers.startDate.trim(),
		'00:00:00',
		answers.utcOffset,
	)
	const endDate = atOffset(
		answers.endDate.trim(),
		'23:59:59',
		answers.utcOffset,
	)
	if (endDate <= startDate) {
		throw new Error(
			`End date ${answers.endDate} is not after start ${answers.startDate}.`,
		)
	}

	const location = (answers.location ?? '').trim()
	const description = location
		? `${answers.description.trim()} — ${location}`
		: answers.description.trim()

	return {
		name: answers.name.trim(),
		description,
		status: answers.status as EventStatus,
		startDate,
		endDate,
		localStart: `${answers.startDate.trim()} 00:00:00 ${answers.utcOffset}`,
		localEnd: `${answers.endDate.trim()} 23:59:59 ${answers.utcOffset}`,
	}
}

/**
 * Decide which WorkflowTemplate each participant type is built from.
 * Returns a map of participant type name -> template name.
 */
async function askWorkflowPlan(
	profile: OrganProfile,
	templateNames: string[],
): Promise<Map<string, string>> {
	const buildable = profile.participantTypes.filter(
		t => !NON_WORKFLOW_PARTICIPANT_TYPES.includes(t.name),
	)

	const { strategy } = await prompts({
		type: 'select',
		name: 'strategy',
		message: 'How should workflows be built?',
		choices: [
			{
				title: `Profile defaults (a per-type mix defined in scripts/profiles/${profile.key}.ts)`,
				value: 'profile',
			},
			{ title: 'One template for every participant type', value: 'uniform' },
			{
				title: `Choose per participant type (${buildable.length} prompts)`,
				value: 'each',
			},
		],
	})
	if (!strategy) cancelled()

	const plan = new Map<string, string>()

	if (strategy === 'profile') {
		for (const t of buildable) plan.set(t.name, t.workflowTemplate)
		return plan
	}

	if (strategy === 'uniform') {
		const { template } = await prompts({
			type: 'select',
			name: 'template',
			message: 'Template for all participant types',
			choices: templateNames.map(n => ({ title: n, value: n })),
		})
		if (!template) cancelled()
		for (const t of buildable) plan.set(t.name, template)
		return plan
	}

	for (const t of buildable) {
		const { template } = await prompts({
			type: 'select',
			name: 'template',
			message: `Template for "${t.name}"`,
			choices: [
				...templateNames.map(n => ({ title: n, value: n })),
				{ title: '(no workflow)', value: '' },
			],
			initial: Math.max(0, templateNames.indexOf(t.workflowTemplate)),
		})
		if (template === undefined) cancelled()
		if (template) plan.set(t.name, template)
	}
	return plan
}

interface TypeDiff {
	toKeep: string[]
	toAdd: string[]
	toRemove: string[]
	wantedNames: Set<string>
}

function diffParticipantTypes(
	profile: OrganProfile,
	currentNames: Set<string>,
): TypeDiff {
	const wantedNames = new Set(profile.participantTypes.map(t => t.name))
	return {
		wantedNames,
		toKeep: profile.participantTypes
			.filter(t => currentNames.has(t.name))
			.map(t => t.name),
		toAdd: profile.participantTypes
			.filter(t => !currentNames.has(t.name))
			.map(t => t.name),
		toRemove: [...currentNames].filter(n => !wantedNames.has(n)).sort(),
	}
}

function printPlan(args: {
	profile: OrganProfile
	diff: TypeDiff
	existingTenant: { name: string } | undefined
	event: EventPlan
	workflowPlan: Map<string, string>
}) {
	const { profile, diff, existingTenant, event, workflowPlan } = args

	console.log('\nPARTICIPANT TYPES:')
	const row = (label: string, names: string[]) =>
		console.log(
			`  ${label.padEnd(7)} ${String(names.length).padStart(3)}  ${names.join(', ') || '-'}`,
		)
	row('kept', diff.toKeep)
	row('added', diff.toAdd)
	row('removed', diff.toRemove)
	console.log(
		`  ${'final'.padEnd(7)} ${String(profile.participantTypes.length).padStart(3)}`,
	)

	console.log('\nTENANT:')
	if (existingTenant) {
		console.log(`  updating existing row "${existingTenant.name}" in place`)
		for (const [key, value] of Object.entries(profile.tenant)) {
			const current = (existingTenant as Record<string, unknown>)[key]
			const marker = current === value ? ' ' : '~'
			console.log(
				`  ${marker} ${key.padEnd(18)} ${String(current ?? '-')} -> ${String(value)}`,
			)
		}
	} else {
		console.log(`  creating "${profile.tenant.name}"`)
	}

	console.log('\nEVENT:')
	console.log(`  name        ${event.name}`)
	console.log(`  description ${event.description}`)
	console.log(`  status      ${event.status}`)
	console.log(
		`  starts      ${event.localStart}   = ${event.startDate.toISOString()}`,
	)
	console.log(
		`  ends        ${event.localEnd}   = ${event.endDate.toISOString()}`,
	)

	console.log('\nWORKFLOWS:')
	if (workflowPlan.size === 0) {
		console.log('  none — create them in the admin UI afterwards')
		return
	}
	const byTemplate = new Map<string, string[]>()
	for (const [type, template] of workflowPlan) {
		byTemplate.set(template, [...(byTemplate.get(template) ?? []), type])
	}
	for (const [template, types] of byTemplate) {
		console.log(`  ${template} (${types.length}): ${types.join(', ')}`)
	}
}

async function seed(
	tx: Prisma.TransactionClient,
	args: {
		profile: OrganProfile
		existingTenantId: string | undefined
		wantedNames: Set<string>
		event: EventPlan
		workflowPlan: Map<string, string>
		templates: Array<{ id: string; name: string }>
	},
) {
	const {
		profile,
		existingTenantId,
		wantedNames,
		event,
		workflowPlan,
		templates,
	} = args

	const tenant = existingTenantId
		? await tx.tenant.update({
				where: { id: existingTenantId },
				data: profile.tenant,
			})
		: await tx.tenant.create({ data: profile.tenant })
	console.log(`  tenant                   ${tenant.name}`)

	// Safe only after the purge: ParticipantType cascades to Participant, so
	// deleting a type while participants reference it destroys them silently.
	const removed = await tx.participantType.deleteMany({
		where: { tenantId: tenant.id, name: { notIn: [...wantedNames] } },
	})
	console.log(`  participantType removed  ${removed.count}`)

	for (const spec of profile.participantTypes) {
		const { workflowTemplate: _ignored, ...data } = spec
		await tx.participantType.upsert({
			where: { tenantId_name: { tenantId: tenant.id, name: spec.name } },
			create: { ...data, tenantId: tenant.id },
			update: data,
		})
	}
	console.log(`  participantType final    ${profile.participantTypes.length}`)

	const created = await tx.event.create({
		data: {
			name: event.name,
			description: event.description,
			status: event.status,
			startDate: event.startDate,
			endDate: event.endDate,
			tenantId: tenant.id,
		},
	})
	console.log(`  event                    ${created.name}`)

	// The new event uses every type in the profile ("Any" is a quota bucket, not a type).
	const eventTypes = await tx.participantType.findMany({
		where: {
			tenantId: tenant.id,
			name: { notIn: NON_WORKFLOW_PARTICIPANT_TYPES },
		},
		select: { id: true },
	})
	await tx.eventParticipantType.createMany({
		data: eventTypes.map(t => ({
			eventId: created.id,
			participantTypeId: t.id,
		})),
	})
	console.log(`  eventParticipantType     ${eventTypes.length}`)

	let workflowCount = 0
	let stepCount = 0
	if (workflowPlan.size > 0) {
		const templateByName = new Map(templates.map(t => [t.name, t]))
		const typeRows = await tx.participantType.findMany({
			where: { tenantId: tenant.id },
			select: { id: true, name: true },
		})
		for (const row of typeRows) {
			const templateName = workflowPlan.get(row.name)
			if (!templateName) continue
			const template = templateByName.get(templateName)!
			const result = await createWorkflowFromTemplate(tx, {
				tenantId: tenant.id,
				eventId: created.id,
				participantTypeId: row.id,
				participantTypeName: row.name,
				templateId: template.id,
				templateName: template.name,
			})
			stepCount += result.stepCount
			workflowCount++
		}
	}
	console.log(`  workflow                 ${workflowCount}`)
	console.log(`  step                     ${stepCount}`)

	return { eventId: created.id, workflowCount }
}

async function main() {
	const confirm = process.argv.includes('--confirm')
	const target = describeTarget()

	printBanner(
		confirm ? 'SETUP EVENT — LIVE RUN' : 'SETUP EVENT — DRY RUN',
		target,
	)

	await assertSchemaMatches(prisma, target.name)

	// --- 1. Profile --------------------------------------------------------
	const profile = await pickProfile()
	console.log(`\nOrgan: ${profile.label}`)

	if (profile.unverifiedFields?.length) {
		console.log(
			'\n⚠  UNVERIFIED VALUES in this profile — confirm before a live run:',
		)
		for (const f of profile.unverifiedFields) console.log(`     - ${f}`)
		console.log(`   Edit scripts/profiles/${profile.key}.ts to correct them.`)
	}

	// --- 2. The history call, before anything else is decided --------------
	const survey = await collectSurvey(prisma)
	printSurvey(survey)

	if (
		!(await confirmHistoryLoss(
			survey.before.participant!,
			survey.before.auditLog!,
		))
	) {
		cancelled()
	}

	// --- Tenant ------------------------------------------------------------
	// The tenant row is reused, never recreated: User.tenantId cascades on
	// delete, so replacing the row would take every staff account with it.
	const tenants = await prisma.tenant.findMany({
		orderBy: { createdAt: 'asc' },
	})
	if (tenants.length > 1) {
		throw new Error(
			`Found ${tenants.length} tenants. This script assumes a single-tenant ` +
				`deployment and will not guess which one to repurpose. ` +
				`Resolve the extra tenants first.`,
		)
	}
	const existingTenant = tenants[0]

	// Templates are tenant-scoped and survive the purge. A newly created tenant
	// has none, and there is nothing to clone from.
	const templates = existingTenant
		? await prisma.workflowTemplate.findMany({
				where: { tenantId: existingTenant.id },
				select: { id: true, name: true, _count: { select: { steps: true } } },
				orderBy: { name: 'asc' },
			})
		: []

	if (!existingTenant) {
		console.log(
			'\n⚠  No tenant exists yet. One will be created, but it will have no ' +
				'workflow or badge templates, so no workflows can be cloned.',
		)
	} else if (templates.length === 0) {
		console.log(
			'\n⚠  This tenant has no workflow templates. No workflows can be cloned.',
		)
	} else {
		console.log('\nAvailable workflow templates:')
		for (const t of templates)
			console.log(`  ${t.name} (${t._count.steps} steps)`)
	}

	const templateNames = templates.map(t => t.name)

	// --- 3 and 4. Event details, then workflows ----------------------------
	const event = await askEventDetails(profile)
	const workflowPlan =
		templateNames.length > 0
			? await askWorkflowPlan(profile, templateNames)
			: new Map<string, string>()

	const unknownTemplates = [...new Set(workflowPlan.values())].filter(
		n => !templateNames.includes(n),
	)
	if (unknownTemplates.length > 0) {
		throw new Error(
			`Profile "${profile.key}" references workflow template(s) that do not ` +
				`exist for this tenant: ${unknownTemplates.join(', ')}. ` +
				`Known templates: ${templateNames.join(', ') || '(none)'}.`,
		)
	}

	// --- Plan --------------------------------------------------------------
	// Scoped to the tenant being repurposed. With no tenant there is nothing to
	// compare against, so the catalogue is entirely new.
	const currentTypes = existingTenant
		? await prisma.participantType.findMany({
				where: { tenantId: existingTenant.id },
				select: { name: true },
			})
		: []
	const diff = diffParticipantTypes(
		profile,
		new Set(currentTypes.map(t => t.name)),
	)

	printPlan({ profile, diff, existingTenant, event, workflowPlan })

	if (!confirm) {
		console.log('\nDry run — nothing was written.')
		console.log('Re-run with --confirm to take a backup, purge and seed.\n')
		return
	}

	// --- Point of no return ------------------------------------------------
	// A typo in the allow-list deletes the account it was meant to protect, so
	// prove every protected username exists before anything is destroyed.
	await assertRetainedUsersExist(prisma)
	await assertNoBlockingBackupRows(prisma)

	const confirmed = await confirmDatabaseName(
		target.name,
		`Type the database name to confirm permanent deletion of ${survey.before.participant} participant(s) and ${survey.before.auditLog} audit log(s)`,
	)
	if (!confirmed) {
		process.exitCode = 1
		return
	}

	// Always before the first write. No backup, no setup.
	runBackupGate()

	console.log('\nPurging...')
	const result = await prisma.$transaction(async tx => {
		await purgeEventData(tx)
		console.log('\nSeeding...')
		return seed(tx, {
			profile,
			existingTenantId: existingTenant?.id,
			wantedNames: diff.wantedNames,
			event,
			workflowPlan,
			templates,
		})
	}, TRANSACTION_OPTIONS)

	// --- Verify ------------------------------------------------------------
	const { after, problems, staffAfter } = await verifyPurge(prisma, {
		before: survey.before,
		expectedPurged: { event: 1, workflow: result.workflowCount },
		// Step counts depend on which template each type was cloned from.
		unassertedPurged: ['step'],
		// Both are deliberately rewritten by this script; asserted below instead.
		rewrittenRetained: ['participantType', 'tenant'],
	})

	if (after.participantType !== profile.participantTypes.length) {
		problems.push(
			`participantType: expected ${profile.participantTypes.length}, found ${after.participantType}`,
		)
	}
	if (after.tenant !== 1) {
		problems.push(`tenant: expected 1, found ${after.tenant}`)
	}

	if (!reportVerification(problems)) return

	console.log('\nSetup complete and verified.')
	console.log(`  ${staffAfter} accounts retained.`)
	console.log(`  Event id: ${result.eventId}`)
	console.log('\nNext steps:')
	console.log(
		'  1. Re-assign validators, printers and checkpoint users to steps',
	)
	console.log('     (UserEventAccess is event-scoped and was cascaded away).')
	console.log('  2. Re-create document and badge Templates for the new event —')
	console.log(
		'     Template is event-scoped and was cascaded away. BadgeTemplate',
	)
	console.log('     survived, so the designs are still there to point at.')
	console.log('  3. Create venues and meetings — this deployment has none.')
	console.log('  4. Set restrictions and quotas for the new event.')
	console.log('  5. Staff must log in again; all sessions were cleared.')
	if (event.status === EventStatus.DRAFT) {
		console.log('  6. Publish the event when registration should open.')
	}
	console.log(
		'  7. Schedule orphan blob reconciliation in Azure (see the runbook).\n',
	)
}

main()
	.catch(e => {
		console.error(`\n${e instanceof Error ? e.message : String(e)}`)
		process.exitCode = 1
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
