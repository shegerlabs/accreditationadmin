// Adding one participant type to an event after setup: loading what the event
// has for it, the default plan, and writing the plan in one transaction.
// Decision record: docs/decisions/2026-11-06-event-participant-types.md

import { type Prisma } from '@prisma/client'
import { z } from 'zod'
import {
	type AddTypeContext,
	type AddTypePlan,
	defaultAccess,
} from './add-participant-type'
import { prisma } from './db.server'
import { addEventParticipantType } from './event-participant-types.server'
import {
	STAFF_ROLES,
	TRANSACTION_OPTIONS,
	profileWorkflowTemplates,
} from './event-setup.server'
import {
	NON_WORKFLOW_PARTICIPANT_TYPES,
	createWorkflowFromTemplate,
} from './workflow-clone.server'

type Event = { id: string; name: string; tenantId: string }

/** Listed types missing a workflow or a badge template, for the event page's banner. */
export async function unfinishedEventTypes(eventId: string) {
	const [listed, workflows, badges] = await Promise.all([
		prisma.eventParticipantType.findMany({
			where: { eventId },
			select: { participantType: { select: { id: true, name: true } } },
		}),
		prisma.workflow.findMany({
			where: { eventId },
			select: { participantTypeId: true },
		}),
		prisma.template.findMany({
			where: { eventId, templateType: 'BADGE' },
			select: { participantTypeId: true },
		}),
	])
	const hasWorkflow = new Set(workflows.map(w => w.participantTypeId))
	const hasBadge = new Set(badges.map(b => b.participantTypeId))
	return {
		hasList: listed.length > 0,
		unfinished: listed
			.map(({ participantType: t }) => ({
				...t,
				missing: [
					...(hasWorkflow.has(t.id) ? [] : (['workflow'] as const)),
					...(hasBadge.has(t.id) ? [] : (['badge'] as const)),
				],
			}))
			.filter(t => t.missing.length > 0)
			.sort((a, b) => a.name.localeCompare(b.name)),
	}
}

/** Most common step name per user across the event's workflows. */
async function eventStepByUser(eventId: string) {
	const rows = await prisma.userEventAccess.findMany({
		where: { eventId, stepId: { not: null } },
		select: { userId: true, step: { select: { name: true } } },
	})
	const counts = new Map<string, Map<string, number>>()
	for (const row of rows) {
		if (!row.step) continue
		const byStep = counts.get(row.userId) ?? new Map<string, number>()
		byStep.set(row.step.name, (byStep.get(row.step.name) ?? 0) + 1)
		counts.set(row.userId, byStep)
	}
	return new Map(
		[...counts].map(([userId, byStep]) => [
			userId,
			[...byStep].sort((a, b) => b[1] - a[1])[0]![0],
		]),
	)
}

export async function loadAddTypeContext(
	event: Event,
	typeId: string | null,
): Promise<AddTypeContext> {
	const [
		types,
		listed,
		workflows,
		badges,
		templates,
		badgeTemplates,
		staff,
		eventSteps,
		restrictions,
	] = await Promise.all([
		prisma.participantType.findMany({
			where: {
				tenantId: event.tenantId,
				name: { notIn: NON_WORKFLOW_PARTICIPANT_TYPES },
			},
			select: { id: true, name: true },
			orderBy: { name: 'asc' },
		}),
		prisma.eventParticipantType.findMany({
			where: { eventId: event.id },
			select: { participantTypeId: true },
		}),
		prisma.workflow.findMany({
			where: { eventId: event.id },
			select: {
				id: true,
				participantTypeId: true,
				steps: {
					select: { name: true, role: { select: { name: true } } },
					orderBy: { order: 'asc' },
				},
			},
		}),
		prisma.template.findMany({
			where: { eventId: event.id, templateType: 'BADGE' },
			select: { participantTypeId: true },
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
		eventStepByUser(event.id),
		prisma.restriction.findMany({
			where: { eventId: event.id },
			select: {
				id: true,
				name: true,
				constraints: {
					where: { participantTypeId: typeId ?? '' },
					select: { accessLevel: true },
				},
				invitationConstraints: {
					select: { invitationId: true },
					distinct: ['invitationId'],
				},
			},
			orderBy: { name: 'asc' },
		}),
	])

	const listedIds = new Set(listed.map(l => l.participantTypeId))
	const workflowFor = new Map(workflows.map(w => [w.participantTypeId, w]))
	const hasBadge = new Set(badges.map(b => b.participantTypeId))
	const candidates = types
		.map(t => ({
			...t,
			listed: listedIds.has(t.id),
			missing: [
				...(workflowFor.has(t.id) ? [] : (['workflow'] as const)),
				...(hasBadge.has(t.id) ? [] : (['badge'] as const)),
			],
		}))
		.filter(t => !t.listed || t.missing.length > 0)
	const type = candidates.find(t => t.id === typeId) ?? null

	const workflow = type ? workflowFor.get(type.id) : undefined
	const existingAccess = workflow
		? await prisma.userEventAccess.findMany({
				where: { eventId: event.id, step: { workflowId: workflow.id } },
				select: { userId: true, step: { select: { name: true } } },
			})
		: []

	const toSteps = (steps: { name: string; role: { name: string } | null }[]) =>
		steps.map(s => ({ name: s.name, role: s.role?.name ?? '' }))

	return {
		event: { id: event.id, name: event.name },
		candidates,
		type: type && { id: type.id, name: type.name },
		workflowTemplates: templates.map(t => ({
			id: t.id,
			name: t.name,
			steps: toSteps(t.steps),
		})),
		badgeTemplates,
		staff: staff.map(u => ({
			id: u.id,
			username: u.username,
			name: u.name ?? u.username,
			roles: u.roles.map(r => r.name).filter(r => STAFF_ROLES.includes(r)),
			eventStep: eventSteps.get(u.id) ?? null,
		})),
		restrictions: restrictions.map(r => ({
			id: r.id,
			name: r.name,
			invitations: r.invitationConstraints.length,
			existingLevels: r.constraints.map(c => c.accessLevel),
		})),
		existing: {
			workflow: workflow ? { steps: toSteps(workflow.steps) } : null,
			badge: type ? hasBadge.has(type.id) : false,
			access: existingAccess.flatMap(a =>
				a.step ? [{ userId: a.userId, stepName: a.step.name }] : [],
			),
		},
	}
}

export async function buildAddTypeDefaults(
	ctx: AddTypeContext,
	tenantId: string,
): Promise<AddTypePlan> {
	const profile = await profileWorkflowTemplates(tenantId)
	const fromProfile = ctx.type && profile.get(ctx.type.name)
	const workflow = ctx.existing.workflow
		? ''
		: ((fromProfile &&
				ctx.workflowTemplates.find(t => t.name === fromProfile)?.id) ??
			ctx.workflowTemplates[0]?.id ??
			'')
	return {
		workflow,
		badge: ctx.existing.badge ? '' : (ctx.badgeTemplates[0]?.id ?? ''),
		access: defaultAccess(ctx, workflow),
		quotas: ctx.restrictions.flatMap(r => {
			const level = (['OPEN', 'CLOSED'] as const).find(
				l => !r.existingLevels.includes(l),
			)
			return level
				? [
						{
							restrictionId: r.id,
							enabled: false,
							accessLevel: level,
							quota: 1,
						},
					]
				: []
		}),
		applyToInvitations: true,
	}
}

const PlanSchema = z.object({
	workflow: z.string(),
	badge: z.string(),
	access: z.array(z.object({ userId: z.string(), stepName: z.string() })),
	quotas: z.array(
		z.object({
			restrictionId: z.string(),
			enabled: z.boolean(),
			accessLevel: z.enum(['OPEN', 'CLOSED']),
			quota: z.number().int().min(0, 'A quota cannot be negative'),
		}),
	),
	applyToInvitations: z.boolean(),
})

export function parseAddTypePlan(raw: unknown) {
	return PlanSchema.safeParse(raw)
}

export type AddTypeResult = {
	listed: boolean
	workflow: boolean
	badge: boolean
	access: number
	quotas: number
	invitationQuotas: number
}

/**
 * Write the plan for one type. Nothing the event already has is replaced, the
 * event's other types are never touched, and every id is checked against the
 * event before use.
 */
export async function applyAddType(
	plan: z.infer<typeof PlanSchema>,
	event: Event,
	type: { id: string; name: string },
): Promise<AddTypeResult> {
	return prisma.$transaction(async tx => {
		const result: AddTypeResult = {
			listed: false,
			workflow: false,
			badge: false,
			access: 0,
			quotas: 0,
			invitationQuotas: 0,
		}

		const alreadyListed = await tx.eventParticipantType.findUnique({
			where: {
				eventId_participantTypeId: {
					eventId: event.id,
					participantTypeId: type.id,
				},
			},
		})
		if (!alreadyListed) {
			await addEventParticipantType(tx, event.id, type.id)
			result.listed = true
		}

		let workflow = await tx.workflow.findFirst({
			where: { eventId: event.id, participantTypeId: type.id },
			select: { id: true },
		})
		if (!workflow && plan.workflow) {
			const template = await tx.workflowTemplate.findFirst({
				where: { id: plan.workflow, tenantId: event.tenantId },
				select: { id: true, name: true },
			})
			if (template) {
				const { workflowId } = await createWorkflowFromTemplate(tx, {
					tenantId: event.tenantId,
					eventId: event.id,
					participantTypeId: type.id,
					participantTypeName: type.name,
					templateId: template.id,
					templateName: template.name,
				})
				workflow = { id: workflowId }
				result.workflow = true
			}
		}

		const hasBadge = await tx.template.count({
			where: {
				eventId: event.id,
				participantTypeId: type.id,
				templateType: 'BADGE',
			},
		})
		if (!hasBadge && plan.badge) {
			const badge = await tx.badgeTemplate.findFirst({
				where: { id: plan.badge, tenantId: event.tenantId },
				select: { id: true },
			})
			if (badge) {
				await tx.template.create({
					data: {
						name: `Badge Template for ${type.name}`,
						description: `Badge Template for ${type.name}`,
						tenantId: event.tenantId,
						eventId: event.id,
						participantTypeId: type.id,
						templateType: 'BADGE',
						badgeTemplateId: badge.id,
					},
				})
				result.badge = true
			}
		}

		// Access: only this type's workflow, so the event's other workflows keep
		// whatever an admin has set on them.
		if (workflow) {
			const steps = await tx.step.findMany({
				where: { workflowId: workflow.id },
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
			const rows: Prisma.UserEventAccessCreateManyInput[] = []
			for (const { userId, stepName } of plan.access) {
				const roles = rolesOf.get(userId)
				if (!stepName || !roles) continue
				for (const step of steps) {
					if (
						step.name === stepName &&
						step.roleId &&
						step.role &&
						roles.has(step.role.name)
					)
						rows.push({
							userId,
							eventId: event.id,
							roleId: step.roleId,
							stepId: step.id,
						})
				}
			}
			result.access = (
				await tx.userEventAccess.createMany({
					data: rows,
					skipDuplicates: true,
				})
			).count
		}

		// Quotas: added beside the restriction's others, never replacing one.
		for (const q of plan.quotas) {
			if (!q.enabled) continue
			const restriction = await tx.restriction.findFirst({
				where: { id: q.restrictionId, eventId: event.id },
				select: { id: true },
			})
			if (!restriction) continue
			const created = await tx.constraint.createMany({
				data: [
					{
						tenantId: event.tenantId,
						restrictionId: restriction.id,
						name: type.name,
						participantTypeId: type.id,
						accessLevel: q.accessLevel,
						quota: q.quota,
					},
				],
				skipDuplicates: true,
			})
			if (created.count === 0) continue
			result.quotas++

			if (!plan.applyToInvitations) continue
			const invitations = await tx.invitationConstraint.findMany({
				where: {
					sourceRestrictionId: restriction.id,
					invitation: { eventId: event.id },
				},
				select: { invitationId: true },
				distinct: ['invitationId'],
			})
			result.invitationQuotas += (
				await tx.invitationConstraint.createMany({
					data: invitations.map(({ invitationId }) => ({
						invitationId,
						participantTypeId: type.id,
						accessLevel: q.accessLevel,
						quota: q.quota,
						sourceRestrictionId: restriction.id,
					})),
					skipDuplicates: true,
				})
			).count
		}

		return result
	}, TRANSACTION_OPTIONS)
}
