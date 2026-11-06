// Editing a draft event's setup: the saved setup as a plan, and saving the
// differences in one transaction. Things the event already has are changed in
// place; removals that would cascade into invitations or participants are
// refused (see loadEditState in event-setup.server.ts).
// Decision record: docs/decisions/2026-11-06-event-setup-wizard.md

import { createHash } from 'node:crypto'
import { type Prisma } from '@prisma/client'
import { prisma } from './db.server'
import {
	KEEP,
	type SetupContext,
	type SetupPlan,
	isCustomEmail,
} from './event-setup'
import {
	type ParsedPlan,
	TRANSACTION_OPTIONS,
	profileWorkflowTemplates,
} from './event-setup.server'
import { EMAIL_TEMPLATE_DEFAULTS, EMAIL_TRIGGERS } from './participant-email'
import { createWorkflowFromTemplate } from './workflow-clone.server'

/** Refusals found while saving, shown to the user instead of a 500. */
export class SetupEditError extends Error {}

/** The event's setup as it is now, in the wizard's plan shape. Resets go back to this. */
export async function buildSavedPlan(
	ctx: SetupContext,
	event: { id: string; tenantId: string },
): Promise<SetupPlan> {
	const [restrictions, badgeRows, emailRows, accessRows, profileTemplate] =
		await Promise.all([
			prisma.restriction.findMany({
				where: { eventId: event.id },
				select: {
					id: true,
					name: true,
					constraints: {
						select: {
							id: true,
							name: true,
							participantTypeId: true,
							accessLevel: true,
							quota: true,
						},
						orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
					},
				},
				orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
			}),
			prisma.template.findMany({
				where: { eventId: event.id, templateType: 'BADGE' },
				select: { participantTypeId: true, badgeTemplateId: true },
				orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
			}),
			prisma.emailTemplate.findMany({
				where: { eventId: event.id },
				select: { trigger: true, enabled: true, subject: true, body: true },
			}),
			prisma.userEventAccess.findMany({
				where: { eventId: event.id, stepId: { not: null } },
				select: { userId: true, step: { select: { name: true } } },
			}),
			profileWorkflowTemplates(event.tenantId),
		])

	const typeName = new Map(ctx.participantTypes.map(t => [t.id, t.name]))
	const templateIdByName = new Map(
		ctx.workflowTemplates.map(t => [t.name, t.id]),
	)
	const hasWorkflow = new Set(
		ctx.existing.workflows.map(w => w.participantTypeId),
	)
	const badgeIds = new Set(ctx.badgeTemplates.map(b => b.id))
	const badgeOf = new Map<string, string | null>()
	for (const b of badgeRows)
		if (!badgeOf.has(b.participantTypeId))
			badgeOf.set(b.participantTypeId, b.badgeTemplateId)

	// Types that aren't on the list start with the same defaults as a first
	// setup, so ticking one prefills its workflow and badge.
	const workflows: Record<string, string> = {}
	const badges: Record<string, string> = {}
	for (const id of ctx.assignableTypeIds) {
		const listed = ctx.existing.typeIds.includes(id)
		const fromProfile = profileTemplate.get(typeName.get(id) ?? '')
		workflows[id] = hasWorkflow.has(id)
			? KEEP
			: listed
				? ''
				: (fromProfile && templateIdByName.get(fromProfile)) ||
					(ctx.workflowTemplates[0]?.id ?? '')
		const badge = badgeOf.get(id)
		badges[id] = badgeOf.has(id)
			? badge && badgeIds.has(badge)
				? badge
				: KEEP
			: listed
				? ''
				: (ctx.badgeTemplates[0]?.id ?? '')
	}

	const emails: SetupPlan['emails'] = {}
	for (const trigger of EMAIL_TRIGGERS) {
		const row = emailRows.find(e => e.trigger === trigger)
		const d = EMAIL_TEMPLATE_DEFAULTS[trigger]
		emails[trigger] = row
			? { enabled: row.enabled, subject: row.subject, body: row.body }
			: { enabled: d.enabled, subject: d.subject, body: d.body }
	}

	return {
		types: ctx.assignableTypeIds.filter(id =>
			ctx.existing.typeIds.includes(id),
		),
		restrictions: restrictions.map(r => ({
			key: r.id,
			name: r.name,
			constraints: r.constraints.map(c => ({
				key: c.id,
				name: c.name,
				participantTypeId: c.participantTypeId,
				accessLevel: c.accessLevel,
				quota: c.quota,
			})),
		})),
		workflows,
		badges,
		emails,
		access: ctx.staff.map(u => ({
			userId: u.id,
			stepName: mostCommonStep(accessRows, u.id),
		})),
	}
}

function mostCommonStep(
	rows: { userId: string; step: { name: string } | null }[],
	userId: string,
) {
	const counts = new Map<string, number>()
	for (const r of rows) {
		if (r.userId === userId && r.step)
			counts.set(r.step.name, (counts.get(r.step.name) ?? 0) + 1)
	}
	// Ties go to the alphabetically first name so the result is stable.
	return (
		[...counts].sort(
			(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
		)[0]?.[0] ?? ''
	)
}

/** Changes whenever the saved setup does, so a save over someone else's edit is refused. */
export function planVersion(saved: SetupPlan) {
	return createHash('sha256').update(JSON.stringify(saved)).digest('hex')
}

export type EditResult = {
	typesAdded: number
	typesRemoved: number
	restrictionsAdded: number
	restrictionsChanged: number
	restrictionsRemoved: number
	workflowsAdded: number
	workflowsReplaced: number
	workflowsRemoved: number
	badgesAdded: number
	badgesChanged: number
	badgesRemoved: number
	emails: number
	accessChanged: number
	accessRows: number
}

/**
 * Save the differences between `saved` (worked out from the database just
 * before this) and `plan`. Every lock is checked again inside the transaction.
 */
export async function applySetupEdit(
	plan: ParsedPlan,
	saved: SetupPlan,
	ctx: SetupContext,
	event: { id: string; tenantId: string },
	userId: string,
): Promise<EditResult> {
	return prisma.$transaction(async tx => {
		const r: EditResult = {
			typesAdded: 0,
			typesRemoved: 0,
			restrictionsAdded: 0,
			restrictionsChanged: 0,
			restrictionsRemoved: 0,
			workflowsAdded: 0,
			workflowsReplaced: 0,
			workflowsRemoved: 0,
			badgesAdded: 0,
			badgesChanged: 0,
			badgesRemoved: 0,
			emails: 0,
			accessChanged: 0,
			accessRows: 0,
		}

		const types = await tx.participantType.findMany({
			where: { tenantId: event.tenantId },
			select: { id: true, name: true },
		})
		const typeName = new Map(types.map(t => [t.id, t.name]))
		const plural = (n: number, one: string) =>
			`${n} ${one}${n === 1 ? '' : 's'}`
		const participantsOf = (participantTypeId: string) =>
			tx.participant.count({ where: { eventId: event.id, participantTypeId } })

		// Participant types.
		const assignable = new Set(ctx.assignableTypeIds)
		const before = new Set(saved.types)
		const finalTypes = plan.types.filter(id => assignable.has(id))
		const after = new Set(finalTypes)
		const removedTypes = saved.types.filter(id => !after.has(id))
		for (const id of removedTypes) {
			const [participants, invitations, quotas] = await Promise.all([
				participantsOf(id),
				tx.invitation.count({
					where: { eventId: event.id, participantTypeId: id },
				}),
				tx.invitationConstraint.count({
					where: { invitation: { eventId: event.id }, participantTypeId: id },
				}),
			])
			if (participants + invitations + quotas > 0)
				throw new SetupEditError(
					`${typeName.get(id)} is used by ${participants ? plural(participants, 'participant') : plural(invitations + quotas, 'invitation')}, so it can't be removed.`,
				)
			await tx.workflow.deleteMany({
				where: { eventId: event.id, participantTypeId: id },
			})
			await tx.template.deleteMany({
				where: {
					eventId: event.id,
					participantTypeId: id,
					templateType: 'BADGE',
				},
			})
			await tx.eventParticipantType.deleteMany({
				where: { eventId: event.id, participantTypeId: id },
			})
			r.typesRemoved++
		}
		const addedTypes = finalTypes.filter(id => !before.has(id))
		await tx.eventParticipantType.createMany({
			data: addedTypes.map(participantTypeId => ({
				eventId: event.id,
				participantTypeId,
			})),
			skipDuplicates: true,
		})
		r.typesAdded = addedTypes.length

		// Restrictions, matched to saved ones by id. Deletes go first so a
		// changed type or session can't collide with the unique quota key.
		const savedRestrictions = await tx.restriction.findMany({
			where: { eventId: event.id },
			select: {
				id: true,
				name: true,
				constraints: true,
				_count: { select: { invitations: true } },
			},
		})
		const savedById = new Map(savedRestrictions.map(x => [x.id, x]))
		const planKeys = new Set(plan.restrictions.map(x => x.key))
		for (const s of savedRestrictions) {
			if (planKeys.has(s.id)) continue
			if (s._count.invitations > 0)
				throw new SetupEditError(
					`${s.name} is used by ${plural(s._count.invitations, 'invitation')}, so it can't be removed.`,
				)
			await tx.restriction.delete({ where: { id: s.id } })
			r.restrictionsRemoved++
		}
		// Kept restrictions go through a temporary name first, so two can swap names.
		const kept = plan.restrictions.filter(x => x.key && savedById.has(x.key))
		const renamed = kept.filter(x => savedById.get(x.key!)!.name !== x.name)
		for (const x of renamed)
			await tx.restriction.update({
				where: { id: x.key },
				data: { name: `${x.key} (renaming)` },
			})
		for (const x of renamed)
			await tx.restriction.update({
				where: { id: x.key },
				data: { name: x.name },
			})
		const validQuota = (c: { participantTypeId: string }) =>
			typeName.has(c.participantTypeId)
		for (const x of plan.restrictions) {
			const s = x.key ? savedById.get(x.key) : undefined
			if (!s) {
				const created = await tx.restriction.create({
					data: { tenantId: event.tenantId, eventId: event.id, name: x.name },
				})
				await tx.constraint.createMany({
					data: x.constraints.filter(validQuota).map(c => ({
						tenantId: event.tenantId,
						restrictionId: created.id,
						name: c.name,
						participantTypeId: c.participantTypeId,
						accessLevel: c.accessLevel,
						quota: c.quota,
					})),
				})
				r.restrictionsAdded++
				continue
			}
			let changed = s.name !== x.name
			const savedC = new Map(s.constraints.map(c => [c.id, c]))
			const planC = new Map(
				x.constraints.flatMap(c =>
					c.key && savedC.has(c.key) ? [[c.key, c]] : [],
				),
			)
			const toCreate = x.constraints.filter(
				c => !(c.key && savedC.has(c.key)) && validQuota(c),
			)
			for (const c of s.constraints) {
				const p = planC.get(c.id)
				if (
					!p ||
					p.participantTypeId !== c.participantTypeId ||
					p.accessLevel !== c.accessLevel
				) {
					await tx.constraint.delete({ where: { id: c.id } })
					if (p && validQuota(p)) toCreate.push(p)
					changed = true
				} else if (p.name !== c.name || p.quota !== c.quota) {
					await tx.constraint.update({
						where: { id: c.id },
						data: { name: p.name, quota: p.quota },
					})
					changed = true
				}
			}
			if (toCreate.length > 0) changed = true
			await tx.constraint.createMany({
				data: toCreate.map(c => ({
					tenantId: event.tenantId,
					restrictionId: s.id,
					name: c.name,
					participantTypeId: c.participantTypeId,
					accessLevel: c.accessLevel,
					quota: c.quota,
				})),
			})
			if (changed) r.restrictionsChanged++
		}

		// Workflows. Replacing or removing one deletes its steps, and with them
		// the staff access on those steps; access is reapplied below.
		const templates = await tx.workflowTemplate.findMany({
			where: { tenantId: event.tenantId },
			select: { id: true, name: true },
		})
		const templateName = new Map(templates.map(t => [t.id, t.name]))
		const existingWorkflows = await tx.workflow.findMany({
			where: { eventId: event.id },
			select: { id: true, participantTypeId: true },
		})
		const newWorkflowIds: string[] = []
		for (const id of finalTypes) {
			const choice = plan.workflows[id] ?? KEEP
			const current = existingWorkflows.filter(w => w.participantTypeId === id)
			if (choice === KEEP) continue
			if (choice && !templateName.has(choice)) continue
			if (current.length > 0) {
				const participants = await participantsOf(id)
				if (participants > 0)
					throw new SetupEditError(
						`${typeName.get(id)} has ${plural(participants, 'participant')}, so its workflow can't be replaced.`,
					)
				await tx.workflow.deleteMany({
					where: { id: { in: current.map(w => w.id) } },
				})
			}
			if (choice) {
				const { workflowId } = await createWorkflowFromTemplate(tx, {
					tenantId: event.tenantId,
					eventId: event.id,
					participantTypeId: id,
					participantTypeName: typeName.get(id)!,
					templateId: choice,
					templateName: templateName.get(choice)!,
				})
				newWorkflowIds.push(workflowId)
				if (current.length > 0) r.workflowsReplaced++
				else r.workflowsAdded++
			} else if (current.length > 0) r.workflowsRemoved++
		}

		// Badge templates: the row is kept and pointed at the new design.
		const badgeIds = new Set(
			(
				await tx.badgeTemplate.findMany({
					where: { tenantId: event.tenantId },
					select: { id: true },
				})
			).map(b => b.id),
		)
		const badgeRows = await tx.template.findMany({
			where: { eventId: event.id, templateType: 'BADGE' },
			select: {
				id: true,
				participantTypeId: true,
				badgeTemplateId: true,
				_count: { select: { attachments: true } },
			},
		})
		for (const id of finalTypes) {
			const choice = plan.badges[id] ?? KEEP
			const rows = badgeRows.filter(b => b.participantTypeId === id)
			if (choice === KEEP) continue
			if (rows.length > 0 && choice === (saved.badges[id] ?? KEEP)) continue
			if (choice === '') {
				if (rows.length === 0) continue
				if (rows.some(b => b._count.attachments > 0))
					throw new SetupEditError(
						`${typeName.get(id)}'s badge template has uploaded files, so it can't be removed.`,
					)
				await tx.template.deleteMany({
					where: { id: { in: rows.map(b => b.id) } },
				})
				r.badgesRemoved++
				continue
			}
			if (!badgeIds.has(choice)) continue
			if (rows.length > 0) {
				await tx.template.updateMany({
					where: { id: { in: rows.map(b => b.id) } },
					data: { badgeTemplateId: choice },
				})
				r.badgesChanged++
			} else {
				await tx.template.create({
					data: {
						name: `Badge Template for ${typeName.get(id)}`,
						description: `Badge Template for ${typeName.get(id)}`,
						tenantId: event.tenantId,
						eventId: event.id,
						participantTypeId: id,
						templateType: 'BADGE',
						badgeTemplateId: choice,
					},
				})
				r.badgesAdded++
			}
		}

		// Emails: a missing row means "default", so going back to it deletes the row.
		for (const trigger of EMAIL_TRIGGERS) {
			const email = plan.emails[trigger]
			if (
				!email ||
				JSON.stringify(email) === JSON.stringify(saved.emails[trigger])
			)
				continue
			if (isCustomEmail(trigger, email)) {
				await tx.emailTemplate.upsert({
					where: { eventId_trigger: { eventId: event.id, trigger } },
					create: { eventId: event.id, trigger, ...email, updatedById: userId },
					update: { ...email, updatedById: userId },
				})
			} else {
				await tx.emailTemplate.deleteMany({
					where: { eventId: event.id, trigger },
				})
			}
			r.emails++
		}

		// Access. Someone whose step changed has their step access in this event
		// replaced. Everyone else keeps theirs, and gets their step on the
		// workflows created just now.
		const steps = await tx.step.findMany({
			where: { workflow: { eventId: event.id } },
			select: {
				id: true,
				name: true,
				workflowId: true,
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
			staff.map(u => [u.id, new Set(u.roles.map(x => x.name))]),
		)
		const savedStep = new Map(saved.access.map(a => [a.userId, a.stepName]))
		const fresh = new Set(newWorkflowIds)
		const rows: Prisma.UserEventAccessCreateManyInput[] = []
		for (const { userId: staffId, stepName } of plan.access) {
			const roles = rolesOf.get(staffId)
			if (!roles || !savedStep.has(staffId)) continue
			const changed = stepName !== savedStep.get(staffId)
			if (changed) {
				await tx.userEventAccess.deleteMany({
					where: { userId: staffId, eventId: event.id, stepId: { not: null } },
				})
				r.accessChanged++
			}
			if (!stepName) continue
			for (const step of steps) {
				if (
					step.name !== stepName ||
					!step.roleId ||
					!step.role ||
					!roles.has(step.role.name) ||
					(!changed && !fresh.has(step.workflowId))
				)
					continue
				rows.push({
					userId: staffId,
					eventId: event.id,
					roleId: step.roleId,
					stepId: step.id,
				})
			}
		}
		const created = await tx.userEventAccess.createMany({
			data: rows,
			skipDuplicates: true,
		})
		r.accessRows = created.count

		return r
	}, TRANSACTION_OPTIONS)
}
