// Event setup wizard: loading what the event has, building the default plan,
// and writing a submitted plan in one transaction.
// Decision record: docs/decisions/2026-11-06-event-setup-wizard.md

import { type Prisma } from '@prisma/client'
import { json } from '@remix-run/node'
import { z } from 'zod'
import { PROFILES } from '../../scripts/profiles/index.js'
import { requireAdminAccess } from './auth.server'
import { prisma } from './db.server'
import {
	type SetupContext,
	type SetupPlan,
	isCustomEmail,
	stepsForUser,
} from './event-setup'
import {
	EMAIL_TEMPLATE_DEFAULTS,
	EMAIL_TRIGGERS,
	type EmailTrigger,
} from './participant-email'
import {
	NON_WORKFLOW_PARTICIPANT_TYPES,
	createWorkflowFromTemplate,
} from './workflow-clone.server'

/** Roles whose users work on workflow steps. */
export const STAFF_ROLES = ['reviewer', 'validator', 'printer', 'dispatcher']

/** The seed's restrictions (prisma/seed.ts), by PAP participant type name. */
const DEFAULT_RESTRICTIONS = [
	{
		name: 'Member States',
		constraints: [
			{ name: 'Closed Session', type: 'Any', accessLevel: 'CLOSED', quota: 20 },
			{ name: 'Any', type: 'Any', accessLevel: 'OPEN', quota: 0 },
		],
	},
	{
		name: 'Non Member States',
		constraints: [
			{
				name: 'Closed Session',
				type: 'Observers',
				accessLevel: 'CLOSED',
				quota: 1,
			},
		],
	},
] as const

/** Interactive transactions default to 5s; cloning ~25 workflows step by step takes longer. */
export const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 }

/** The event a setup page works on: the user's tenant, not deleted, not closed. */
export async function requireSetupEvent(
	request: Request,
	eventId: string | undefined,
) {
	const user = await requireAdminAccess(request)
	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			name: true,
			status: true,
			tenantId: true,
			deletedAt: true,
		},
	})
	if (!event || event.deletedAt)
		throw new Response('Not Found', { status: 404 })
	if (!user.isGlobalAdmin && event.tenantId !== user.tenantId) {
		throw json({ message: 'Access denied' }, { status: 403 })
	}
	if (event.status === 'COMPLETED') {
		throw json(
			{ message: 'This event is closed. Reopen it before changing its setup.' },
			{ status: 409 },
		)
	}
	return { user, event }
}

/** The organ profile's workflow template name per participant type name, matched on the tenant's name. */
export async function profileWorkflowTemplates(tenantId: string) {
	const tenant = await prisma.tenant.findUnique({
		where: { id: tenantId },
		select: { name: true },
	})
	const profile = PROFILES.find(p => p.tenant.name === tenant?.name)
	return new Map(
		profile?.participantTypes.map(t => [t.name, t.workflowTemplate]),
	)
}

/** A draft that already has a type list is edited; anything else gets the fill-in-the-gaps setup. */
export function setupMode(
	status: string,
	typeCount: number,
): SetupContext['mode'] {
	return status === 'DRAFT' && typeCount > 0 ? 'edit' : 'create'
}

export async function loadSetupContext(event: {
	id: string
	name: string
	tenantId: string
	status: string
}): Promise<SetupContext> {
	const [
		types,
		templates,
		badgeTemplates,
		staff,
		restrictions,
		workflows,
		badges,
		emails,
		accessRows,
		eventTypes,
		previousEvent,
	] = await Promise.all([
		prisma.participantType.findMany({
			where: { tenantId: event.tenantId },
			select: { id: true, name: true },
			orderBy: { name: 'asc' },
		}),
		prisma.workflowTemplate.findMany({
			where: { tenantId: event.tenantId },
			select: {
				id: true,
				name: true,
				steps: {
					select: { name: true, role: { select: { name: true } } },
					orderBy: { order: 'asc' },
				},
			},
			orderBy: { name: 'asc' },
		}),
		prisma.badgeTemplate.findMany({
			where: { tenantId: event.tenantId },
			select: { id: true, name: true, isDefault: true },
			orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
		}),
		prisma.user.findMany({
			where: {
				tenantId: event.tenantId,
				status: 'ACTIVE',
				roles: { some: { name: { in: STAFF_ROLES } } },
			},
			select: {
				id: true,
				username: true,
				name: true,
				roles: { select: { name: true } },
			},
			orderBy: { username: 'asc' },
		}),
		prisma.restriction.count({ where: { eventId: event.id } }),
		prisma.workflow.findMany({
			where: { eventId: event.id },
			select: {
				participantTypeId: true,
				steps: { select: { name: true, role: { select: { name: true } } } },
			},
		}),
		prisma.template.findMany({
			where: { eventId: event.id, templateType: 'BADGE' },
			select: { participantTypeId: true },
		}),
		prisma.emailTemplate.findMany({
			where: { eventId: event.id },
			select: { trigger: true },
		}),
		prisma.userEventAccess.count({ where: { eventId: event.id } }),
		prisma.eventParticipantType.findMany({
			where: { eventId: event.id },
			select: { participantTypeId: true },
		}),
		prisma.event.findFirst({
			where: {
				tenantId: event.tenantId,
				id: { not: event.id },
				deletedAt: null,
				participantTypes: { some: {} },
			},
			orderBy: { startDate: 'desc' },
			select: {
				name: true,
				participantTypes: { select: { participantTypeId: true } },
			},
		}),
	])

	const mode = setupMode(event.status, eventTypes.length)
	const typeNames = new Map(types.map(t => [t.id, t.name]))
	return {
		event: { id: event.id, name: event.name },
		mode,
		...(mode === 'edit'
			? await loadEditState(event.id, typeNames)
			: {
					locks: { typeRemoval: {}, workflow: {}, badge: {}, restriction: {} },
					saved: { workflowNames: {}, accessSteps: {} },
				}),
		participantTypes: types,
		assignableTypeIds: types
			.filter(t => !NON_WORKFLOW_PARTICIPANT_TYPES.includes(t.name))
			.map(t => t.id),
		previousEvent: previousEvent && {
			name: previousEvent.name,
			typeIds: previousEvent.participantTypes.map(t => t.participantTypeId),
		},
		workflowTemplates: templates.map(t => ({
			id: t.id,
			name: t.name,
			steps: t.steps.map(s => ({ name: s.name, role: s.role?.name ?? '' })),
		})),
		badgeTemplates,
		staff: staff.map(u => ({
			id: u.id,
			username: u.username,
			name: u.name ?? u.username,
			roles: u.roles.map(r => r.name).filter(r => STAFF_ROLES.includes(r)),
		})),
		existing: {
			typeIds: eventTypes.map(t => t.participantTypeId),
			restrictions,
			workflows: workflows.map(w => ({
				participantTypeId: w.participantTypeId,
				steps: w.steps.map(s => ({ name: s.name, role: s.role?.name ?? '' })),
			})),
			badgeTypeIds: [...new Set(badges.map(b => b.participantTypeId))],
			emailTriggers: emails.map(e => e.trigger as EmailTrigger),
			accessRows,
		},
	}
}

/**
 * What stops a draft's setup from being changed: removing a restriction deletes
 * its invitations, and removing a workflow deletes the participants on its
 * steps (both cascade), so those are refused rather than done quietly.
 */
async function loadEditState(eventId: string, typeNames: Map<string, string>) {
	const [
		participants,
		invitations,
		invitationQuotas,
		restrictions,
		badges,
		workflows,
		access,
	] = await Promise.all([
		prisma.participant.groupBy({
			by: ['participantTypeId'],
			where: { eventId },
			_count: true,
		}),
		prisma.invitation.groupBy({
			by: ['participantTypeId'],
			where: { eventId, participantTypeId: { not: null } },
			_count: true,
		}),
		prisma.invitationConstraint.groupBy({
			by: ['participantTypeId'],
			where: { invitation: { eventId } },
			_count: true,
		}),
		prisma.restriction.findMany({
			where: { eventId },
			select: {
				id: true,
				name: true,
				_count: { select: { invitations: true } },
			},
		}),
		prisma.template.findMany({
			where: { eventId, templateType: 'BADGE' },
			select: {
				participantTypeId: true,
				_count: { select: { attachments: true } },
			},
		}),
		prisma.workflow.findMany({
			where: { eventId },
			select: { participantTypeId: true, name: true },
			orderBy: { createdAt: 'asc' },
		}),
		prisma.userEventAccess.findMany({
			where: { eventId, stepId: { not: null } },
			select: { userId: true, step: { select: { name: true } } },
		}),
	])
	const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
	const name = (id: string | null) => typeNames.get(id ?? '') ?? 'This type'

	const locks: SetupContext['locks'] = {
		typeRemoval: {},
		workflow: {},
		badge: {},
		restriction: {},
	}
	for (const p of participants) {
		const reason = `${name(p.participantTypeId)} has ${plural(p._count, 'participant')}`
		locks.typeRemoval[p.participantTypeId] = reason
		locks.workflow[p.participantTypeId] = reason
	}
	for (const i of invitations) {
		locks.typeRemoval[i.participantTypeId!] ??=
			`${name(i.participantTypeId)} is the type of ${plural(i._count, 'invitation')}`
	}
	for (const q of invitationQuotas) {
		locks.typeRemoval[q.participantTypeId] ??=
			`${name(q.participantTypeId)} has quotas in ${plural(q._count, 'invitation')}`
	}
	for (const r of restrictions) {
		if (r._count.invitations > 0)
			locks.restriction[r.id] =
				`${r.name} is used by ${plural(r._count.invitations, 'invitation')}`
	}
	for (const b of badges) {
		if (b._count.attachments > 0)
			locks.badge[b.participantTypeId] =
				`${name(b.participantTypeId)}'s badge template has uploaded files`
	}

	const stepNames = new Map<string, Set<string>>()
	for (const a of access) {
		if (!a.step) continue
		const names = stepNames.get(a.userId) ?? new Set<string>()
		names.add(a.step.name)
		stepNames.set(a.userId, names)
	}
	return {
		locks,
		saved: {
			workflowNames: Object.fromEntries(
				workflows.map(w => [w.participantTypeId, w.name]),
			),
			accessSteps: Object.fromEntries(
				[...stepNames].map(([userId, names]) => [userId, names.size]),
			),
		},
	}
}

let keySeq = 0
const key = () => `d${keySeq++}`

export async function buildDefaultPlan(
	ctx: SetupContext,
	event: { id: string; tenantId: string },
): Promise<SetupPlan> {
	const typeIdByName = new Map(ctx.participantTypes.map(t => [t.name, t.id]))
	const typeNameById = new Map(ctx.participantTypes.map(t => [t.id, t.name]))

	// The previous event's list where it has one, else every type.
	const types =
		ctx.existing.typeIds.length > 0
			? []
			: ctx.previousEvent
				? ctx.assignableTypeIds.filter(id =>
						ctx.previousEvent!.typeIds.includes(id),
					)
				: [...ctx.assignableTypeIds]

	const restrictions =
		ctx.existing.restrictions > 0
			? []
			: DEFAULT_RESTRICTIONS.map(r => ({
					key: key(),
					name: r.name,
					constraints: r.constraints.flatMap(c => {
						const participantTypeId = typeIdByName.get(c.type)
						return participantTypeId
							? [
									{
										key: key(),
										name: c.name,
										participantTypeId,
										accessLevel: c.accessLevel,
										quota: c.quota,
									},
								]
							: []
					}),
				}))

	// The organ profile scripts/setup-event uses.
	const profileTemplate = await profileWorkflowTemplates(event.tenantId)
	const templateIdByName = new Map(
		ctx.workflowTemplates.map(t => [t.name, t.id]),
	)
	const fallbackTemplateId = ctx.workflowTemplates[0]?.id ?? ''

	const hasWorkflow = new Set(
		ctx.existing.workflows.map(w => w.participantTypeId),
	)
	const workflows: Record<string, string> = {}
	for (const id of ctx.assignableTypeIds) {
		if (hasWorkflow.has(id)) continue
		const fromProfile = profileTemplate.get(typeNameById.get(id) ?? '')
		workflows[id] =
			(fromProfile && templateIdByName.get(fromProfile)) || fallbackTemplateId
	}

	const defaultBadgeId = ctx.badgeTemplates[0]?.id ?? ''
	const badges: Record<string, string> = {}
	for (const id of ctx.assignableTypeIds) {
		if (!ctx.existing.badgeTypeIds.includes(id)) badges[id] = defaultBadgeId
	}

	const emails: SetupPlan['emails'] = {}
	for (const trigger of EMAIL_TRIGGERS) {
		if (ctx.existing.emailTriggers.includes(trigger)) continue
		const d = EMAIL_TEMPLATE_DEFAULTS[trigger]
		emails[trigger] = { enabled: d.enabled, subject: d.subject, body: d.body }
	}

	const plan: SetupPlan = {
		types,
		restrictions,
		workflows,
		badges,
		emails,
		access: [],
	}
	plan.access = await defaultAccess(ctx, plan, event)
	return plan
}

/**
 * The step each user worked on in the tenant's previous event. Without one, the
 * only step for the user's role in these workflows; validators and reviewers have
 * several, so they start with none rather than a guess.
 */
async function defaultAccess(
	ctx: SetupContext,
	plan: SetupPlan,
	event: { id: string; tenantId: string },
) {
	const previous = await prisma.event.findFirst({
		where: {
			tenantId: event.tenantId,
			id: { not: event.id },
			deletedAt: null,
			userAccess: { some: {} },
		},
		orderBy: { startDate: 'desc' },
		select: {
			userAccess: {
				where: { stepId: { not: null } },
				select: { userId: true, step: { select: { name: true } } },
			},
		},
	})

	const previousStep = new Map<string, string>()
	if (previous) {
		const counts = new Map<string, Map<string, number>>()
		for (const row of previous.userAccess) {
			if (!row.step) continue
			const byStep = counts.get(row.userId) ?? new Map<string, number>()
			byStep.set(row.step.name, (byStep.get(row.step.name) ?? 0) + 1)
			counts.set(row.userId, byStep)
		}
		for (const [userId, byStep] of counts) {
			previousStep.set(userId, [...byStep].sort((a, b) => b[1] - a[1])[0]![0])
		}
	}

	return ctx.staff.map(user => {
		const available = stepsForUser(ctx, plan, user.id)
		const remembered = previousStep.get(user.id)
		if (remembered && available.includes(remembered))
			return { userId: user.id, stepName: remembered }
		return {
			userId: user.id,
			stepName: available.length === 1 ? available[0]! : '',
		}
	})
}

const PlanSchema = z.object({
	types: z.array(z.string()),
	restrictions: z.array(
		z.object({
			/** Edit mode: the saved restriction's id; a new one has a client key. */
			key: z.string().optional(),
			name: z.string().trim().min(1, 'Every restriction needs a name'),
			constraints: z.array(
				z.object({
					key: z.string().optional(),
					name: z.string().trim().min(1, 'Every quota needs a name'),
					participantTypeId: z.string(),
					accessLevel: z.enum(['OPEN', 'CLOSED']),
					quota: z.number().int().min(0),
				}),
			),
		}),
	),
	workflows: z.record(z.string()),
	badges: z.record(z.string()),
	emails: z.record(
		z.object({
			enabled: z.boolean(),
			subject: z.string().trim().min(1, 'An email subject cannot be empty'),
			body: z.string().trim().min(1, 'An email body cannot be empty'),
		}),
	),
	access: z.array(z.object({ userId: z.string(), stepName: z.string() })),
})

export type ParsedPlan = z.infer<typeof PlanSchema>

export function parsePlan(raw: unknown) {
	return PlanSchema.safeParse(raw)
}

export type SetupResult = {
	types: number
	restrictions: number
	constraints: number
	workflows: number
	badges: number
	emails: number
	access: number
}

/**
 * Write the plan. Everything the event already has is skipped, never replaced,
 * and every id is checked against the event's tenant before use.
 */
export async function applySetup(
	plan: ParsedPlan,
	event: { id: string; tenantId: string },
	userId: string,
): Promise<SetupResult> {
	return prisma.$transaction(async tx => {
		const result: SetupResult = {
			types: 0,
			restrictions: 0,
			constraints: 0,
			workflows: 0,
			badges: 0,
			emails: 0,
			access: 0,
		}

		const types = await tx.participantType.findMany({
			where: { tenantId: event.tenantId },
			select: { id: true, name: true },
		})
		const typeName = new Map(types.map(t => [t.id, t.name]))
		const tenantAssignable = types
			.filter(t => !NON_WORKFLOW_PARTICIPANT_TYPES.includes(t.name))
			.map(t => t.id)

		// Participant types: only into an event that has none. Everything
		// below is limited to the event's types.
		const savedTypes = await tx.eventParticipantType.findMany({
			where: { eventId: event.id },
			select: { participantTypeId: true },
		})
		let eventTypeIds = savedTypes.map(t => t.participantTypeId)
		if (eventTypeIds.length === 0) {
			eventTypeIds = tenantAssignable.filter(id => plan.types.includes(id))
			await tx.eventParticipantType.createMany({
				data: eventTypeIds.map(participantTypeId => ({
					eventId: event.id,
					participantTypeId,
				})),
			})
			result.types = eventTypeIds.length
		}
		const assignable = new Set(eventTypeIds)

		// Restrictions: only into an event that has none.
		if ((await tx.restriction.count({ where: { eventId: event.id } })) === 0) {
			for (const r of plan.restrictions) {
				const restriction = await tx.restriction.create({
					data: { tenantId: event.tenantId, eventId: event.id, name: r.name },
				})
				const constraints = r.constraints.filter(c =>
					typeName.has(c.participantTypeId),
				)
				await tx.constraint.createMany({
					data: constraints.map(c => ({
						tenantId: event.tenantId,
						restrictionId: restriction.id,
						name: c.name,
						participantTypeId: c.participantTypeId,
						accessLevel: c.accessLevel,
						quota: c.quota,
					})),
				})
				result.restrictions++
				result.constraints += constraints.length
			}
		}

		// Workflows: one per participant type that has none yet.
		const templates = await tx.workflowTemplate.findMany({
			where: { tenantId: event.tenantId },
			select: { id: true, name: true },
		})
		const templateName = new Map(templates.map(t => [t.id, t.name]))
		const hasWorkflow = new Set(
			(
				await tx.workflow.findMany({
					where: { eventId: event.id },
					select: { participantTypeId: true },
				})
			).map(w => w.participantTypeId),
		)
		for (const [participantTypeId, templateId] of Object.entries(
			plan.workflows,
		)) {
			if (
				!templateId ||
				!assignable.has(participantTypeId) ||
				hasWorkflow.has(participantTypeId)
			)
				continue
			const name = templateName.get(templateId)
			if (!name) continue
			await createWorkflowFromTemplate(tx, {
				tenantId: event.tenantId,
				eventId: event.id,
				participantTypeId,
				participantTypeName: typeName.get(participantTypeId)!,
				templateId,
				templateName: name,
			})
			result.workflows++
		}

		// Badge templates: same naming as the Templates tab's bulk create.
		const badgeIds = new Set(
			(
				await tx.badgeTemplate.findMany({
					where: { tenantId: event.tenantId },
					select: { id: true },
				})
			).map(b => b.id),
		)
		const hasBadge = new Set(
			(
				await tx.template.findMany({
					where: { eventId: event.id, templateType: 'BADGE' },
					select: { participantTypeId: true },
				})
			).map(t => t.participantTypeId),
		)
		const badgeRows = Object.entries(plan.badges).filter(
			([typeId, badgeId]) =>
				badgeId &&
				badgeIds.has(badgeId) &&
				assignable.has(typeId) &&
				!hasBadge.has(typeId),
		)
		await tx.template.createMany({
			data: badgeRows.map(([participantTypeId, badgeTemplateId]) => ({
				name: `Badge Template for ${typeName.get(participantTypeId)}`,
				description: `Badge Template for ${typeName.get(participantTypeId)}`,
				tenantId: event.tenantId,
				eventId: event.id,
				participantTypeId,
				templateType: 'BADGE' as const,
				badgeTemplateId,
			})),
		})
		result.badges = badgeRows.length

		// Emails: a missing row means "default", so only differences are written.
		const customised = new Set(
			(
				await tx.emailTemplate.findMany({
					where: { eventId: event.id },
					select: { trigger: true },
				})
			).map(e => e.trigger as string),
		)
		for (const trigger of EMAIL_TRIGGERS) {
			const email = plan.emails[trigger]
			if (!email || customised.has(trigger) || !isCustomEmail(trigger, email))
				continue
			await tx.emailTemplate.create({
				data: { eventId: event.id, trigger, ...email, updatedById: userId },
			})
			result.emails++
		}

		// Access: every step with the chosen name, across the event's workflows.
		const steps = await tx.step.findMany({
			where: { workflow: { eventId: event.id } },
			select: {
				id: true,
				name: true,
				roleId: true,
				role: { select: { name: true } },
			},
		})
		const staff = await tx.user.findMany({
			where: {
				tenantId: event.tenantId,
				id: { in: plan.access.map(a => a.userId) },
			},
			select: { id: true, roles: { select: { name: true } } },
		})
		const rolesOf = new Map(
			staff.map(u => [u.id, new Set(u.roles.map(r => r.name))]),
		)
		const accessRows: Prisma.UserEventAccessCreateManyInput[] = []
		for (const { userId: staffId, stepName } of plan.access) {
			const roles = rolesOf.get(staffId)
			if (!stepName || !roles) continue
			for (const step of steps) {
				if (
					step.name !== stepName ||
					!step.roleId ||
					!step.role ||
					!roles.has(step.role.name)
				)
					continue
				accessRows.push({
					userId: staffId,
					eventId: event.id,
					roleId: step.roleId,
					stepId: step.id,
				})
			}
		}
		const created = await tx.userEventAccess.createMany({
			data: accessRows,
			skipDuplicates: true,
		})
		result.access = created.count

		return result
	}, TRANSACTION_OPTIONS)
}
