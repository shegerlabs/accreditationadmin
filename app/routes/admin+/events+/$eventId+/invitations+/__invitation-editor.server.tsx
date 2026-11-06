import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { auditRequest } from '~/utils/audit.server'
import { getPasswordHash, requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import {
	NOT_IN_EVENT_MESSAGE,
	getEventParticipantTypes,
} from '~/utils/event-participant-types.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import {
	InvitationDeleteSchema,
	InvitationEditorSchema,
} from './__invitation-editor'
import { SecretsEditorSchema } from './__secrets-editor'

type InvitationResult = {
	email: string
	name: string | null
	organizations: string
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'secrets') {
		const submission = await parseWithZod(formData, {
			schema: SecretsEditorSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const invitations = await prisma.$queryRaw<InvitationResult[]>`
			SELECT
				email,
				MAX(name) as name,
				STRING_AGG(organization, ', ' ORDER BY organization) as organizations
			FROM "Invitation"
			WHERE "eventId" = ${submission.value.eventId}
			GROUP BY email
			ORDER BY email ASC
		`

		// Lowercase all emails for consistency
		const normalizedInvitations = invitations.map(inv => ({
			...inv,
			email: inv.email.toLowerCase(),
		}))

		const existingUsers = await prisma.user.findMany({
			where: { email: { in: normalizedInvitations.map(inv => inv.email) } },
			select: { email: true },
		})
		const existingEmails = new Set(existingUsers.map(user => user.email))

		const generatePassword = () => {
			const chars =
				'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
			return Array.from({ length: 10 }, () =>
				chars.charAt(Math.floor(Math.random() * chars.length)),
			).join('')
		}

		// Prepare all passwords and hashes
		const userUpdates = await Promise.all(
			normalizedInvitations.map(async ({ email, name }) => {
				const password = generatePassword()
				const hash = await getPasswordHash(password)
				return {
					email,
					name,
					password,
					hash,
					status: existingEmails.has(email) ? 'updated' : 'created',
				}
			}),
		)

		const secrets = await prisma.$transaction(
			async tx => {
				const results = []
				for (const update of userUpdates) {
					// Extract username from email (part before @)
					const username = update.email.split('@')[0]

					await tx.user.upsert({
						where: { email: update.email },
						create: {
							email: update.email,
							username: username,
							name: update.name || update.email,
							tenantId: submission.value.tenantId,
							roles: {
								connect: [{ name: 'focal' }],
							},
							password: {
								create: { hash: update.hash },
							},
						},
						update: {
							tenantId: submission.value.tenantId,
							name: update.name || undefined,
							roles: {
								set: [],
								connect: [{ name: 'focal' }],
							},
							password: {
								upsert: {
									create: { hash: update.hash },
									update: { hash: update.hash },
								},
							},
						},
					})

					// Find the invitation with organizations for this email
					const invitation = normalizedInvitations.find(
						inv => inv.email === update.email,
					)

					results.push({
						email: update.email,
						password: update.password,
						status: update.status,
						organizations: invitation?.organizations || '', // Include organizations
					})
				}

				return results
			},
			{
				timeout: 30000,
			},
		)

		return json({ result: secrets })
	}

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: InvitationDeleteSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const invitation = await prisma.invitation.delete({
			select: { eventId: true },
			where: { id: submission.value.id },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.INVITATION,
			entityId: submission.value.id,
			description: 'Invitation deleted',
			userId: user.id,
		})

		return redirectWithToast(
			`/admin/events/${invitation.eventId}/invitations`,
			{
				type: 'success',
				title: `Invitation Deleted`,
				description: `Invitation deleted successfully.`,
			},
		)
	}

	const submission = await parseWithZod(formData, {
		schema: InvitationEditorSchema.superRefine(async (data, ctx) => {
			const allowed = await getEventParticipantTypes(data.eventId, {
				includeAny: true,
			})
			const outside = (data.constraints ?? []).findIndex(
				c => !allowed.some(t => t.id === c.participantTypeId),
			)
			if (outside !== -1) {
				ctx.addIssue({
					path: ['constraints', outside, 'participantTypeId'],
					code: z.ZodIssueCode.custom,
					message: NOT_IN_EVENT_MESSAGE,
				})
				return
			}
			// Lowercase email for consistency
			const email = data.email ? data.email.toLowerCase() : ''
			const invitation = await prisma.invitation.findUnique({
				where: {
					tenantId_eventId_organization_email: {
						tenantId: data.tenantId,
						eventId: data.eventId,
						organization: data.organization ?? '',
						email,
					},
				},
				select: { id: true },
			})

			if (invitation && invitation.id !== data.id) {
				ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: 'Invitation with this email already exists.',
				})
				return
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { id: invitationId, constraints, ...data } = submission.value

	// Lowercase email for consistency
	const email = data.email ? data.email.toLowerCase() : ''

	const invitation = await prisma.$transaction(async tx => {
		// Create or update the invitation
		const inv = await tx.invitation.upsert({
			select: { id: true },
			where: { id: invitationId ?? '__new_invitation__' },
			create: {
				...data,
				maximumQuota: data.maximumQuota ? Number(data.maximumQuota) : null,
				organization: data.organization ?? '',
				email,
			},
			update: {
				...data,
				maximumQuota: data.maximumQuota ? Number(data.maximumQuota) : null,
				organization: data.organization ?? '',
				email,
			},
		})

		// Handle constraints - delete existing and create new
		if (invitationId) {
			await tx.invitationConstraint.deleteMany({
				where: { invitationId: inv.id },
			})
		}

		// Create new constraints
		if (constraints && constraints.length > 0) {
			await tx.invitationConstraint.createMany({
				data: constraints.map(c => ({
					invitationId: inv.id,
					participantTypeId: c.participantTypeId,
					accessLevel: c.accessLevel,
					quota: c.quota ?? null,
					sourceRestrictionId: c.sourceRestrictionId || null,
				})),
			})
		}

		return inv
	})

	const action = invitationId ? AuditAction.UPDATE : AuditAction.CREATE
	const entityType = AuditEntityType.INVITATION
	const entityId = invitation.id
	const description = invitationId ? 'Invitation updated' : 'Invitation created'
	await auditRequest({
		request,
		action,
		entityType,
		entityId,
		description,
		userId: user.id,
		metadata: {
			invitation: {
				id: invitation.id,
				...data,
				constraints,
			},
		},
	})

	return redirectWithToast(`/admin/events/${data.eventId}/invitations`, {
		type: 'success',
		title: `Invitation ${invitationId ? 'Updated' : 'Created'}`,
		description: `Invitation ${invitationId ? 'updated' : 'created'} successfully.`,
	})
}
