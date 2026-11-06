// backfill-event-participant-types.ts
// Give every event that predates EventParticipantType its list of participant
// types: each type the event already uses in a workflow, badge template, quota,
// invitation or participant. "Any" is a quota bucket and is never listed.
//
// USAGE:
//   npx tsx scripts/backfill-event-participant-types.ts            # DRY RUN: prints what it would add
//   npx tsx scripts/backfill-event-participant-types.ts --confirm  # writes the rows
//
// Run once after `prisma db push` adds the table, and before deploying the
// portal: the portal's registration form only offers listed types.
//
// Only adds rows, and skips events that already have a list, so it is safe to re-run.
//
// Decision record: docs/decisions/2026-11-06-event-participant-types.md

import { PrismaClient } from '@prisma/client'
import { NON_WORKFLOW_PARTICIPANT_TYPES } from '../app/utils/workflow-clone.server.js'
import { describeTarget, printBanner } from './lib/target.js'

const prisma = new PrismaClient()

async function usedTypeIds(eventId: string) {
	const [
		workflows,
		templates,
		constraints,
		invitations,
		invConstraints,
		participants,
	] = await Promise.all([
		prisma.workflow.findMany({
			where: { eventId },
			select: { participantTypeId: true },
		}),
		prisma.template.findMany({
			where: { eventId },
			select: { participantTypeId: true },
		}),
		prisma.constraint.findMany({
			where: { restriction: { eventId } },
			select: { participantTypeId: true },
		}),
		prisma.invitation.findMany({
			where: { eventId, participantTypeId: { not: null } },
			select: { participantTypeId: true },
		}),
		prisma.invitationConstraint.findMany({
			where: { invitation: { eventId } },
			select: { participantTypeId: true },
		}),
		prisma.participant.findMany({
			where: { eventId },
			select: { participantTypeId: true },
			distinct: ['participantTypeId'],
		}),
	])
	return new Set(
		[
			workflows,
			templates,
			constraints,
			invitations,
			invConstraints,
			participants,
		]
			.flat()
			.map(r => r.participantTypeId)
			.filter((id): id is string => Boolean(id)),
	)
}

async function main() {
	const confirm = process.argv.includes('--confirm')
	printBanner(
		confirm
			? 'BACKFILL EVENT PARTICIPANT TYPES — LIVE RUN'
			: 'BACKFILL EVENT PARTICIPANT TYPES — DRY RUN',
		describeTarget(),
	)

	const events = await prisma.event.findMany({
		where: { participantTypes: { none: {} } },
		select: { id: true, name: true, tenantId: true },
		orderBy: { startDate: 'asc' },
	})
	if (events.length === 0) {
		console.log(
			'Every event already has a participant type list. Nothing to do.',
		)
		return
	}

	const plans: { event: (typeof events)[number]; typeIds: string[] }[] = []
	for (const event of events) {
		const used = await usedTypeIds(event.id)
		const types = await prisma.participantType.findMany({
			where: {
				tenantId: event.tenantId,
				id: { in: [...used] },
				name: { notIn: NON_WORKFLOW_PARTICIPANT_TYPES },
			},
			select: { id: true },
		})
		plans.push({ event, typeIds: types.map(t => t.id) })
		console.log(
			`  ${event.name.padEnd(50)} ${String(types.length).padStart(3)} type(s)`,
		)
	}

	const empty = plans.filter(p => p.typeIds.length === 0)
	if (empty.length > 0) {
		console.log(
			`\n${empty.length} event(s) use no participant types yet and get no list. ` +
				'Their setup wizard will ask for one.',
		)
	}

	if (!confirm) {
		console.log(
			'\nDry run: nothing written. Re-run with --confirm to add these rows.',
		)
		return
	}

	const created = await prisma.$transaction(async tx => {
		let n = 0
		for (const { event, typeIds } of plans) {
			const result = await tx.eventParticipantType.createMany({
				data: typeIds.map(participantTypeId => ({
					eventId: event.id,
					participantTypeId,
				})),
				skipDuplicates: true,
			})
			n += result.count
		}
		return n
	})
	console.log(
		`\nAdded ${created} row(s) across ${plans.length - empty.length} event(s).`,
	)
}

main()
	.catch(error => {
		console.error(error)
		process.exitCode = 1
	})
	.finally(() => prisma.$disconnect())
