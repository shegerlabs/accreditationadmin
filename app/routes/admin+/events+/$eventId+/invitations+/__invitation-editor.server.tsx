import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { auditRequest } from '~/utils/audit.server'
import { getPasswordHash, requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
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
	organizations: string
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin'])

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
				STRING_AGG(organization, ', ' ORDER BY organization) as organizations
			FROM "Invitation"
			WHERE "eventId" = ${submission.value.eventId}
			GROUP BY email
			ORDER BY email ASC
		`

		const existingUsers = await prisma.user.findMany({
			where: { email: { in: invitations.map(inv => inv.email) } },
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
			invitations.map(async ({ email }) => {
				const password = generatePassword()
				const hash = await getPasswordHash(password)
				return {
					email,
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
					await tx.user.upsert({
						where: { email: update.email },
						create: {
							email: update.email,
							username: update.email,
							name: update.email,
							roles: {
								connect: [{ name: 'focal' }],
							},
							password: {
								create: { hash: update.hash },
							},
						},
						update: {
							password: {
								upsert: {
									create: { hash: update.hash },
									update: { hash: update.hash },
								},
							},
						},
					})

					// Find the invitation with organizations for this email
					const invitation = invitations.find(inv => inv.email === update.email)

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
			const invitation = await prisma.invitation.findUnique({
				where: {
					tenantId_eventId_participantTypeId_restrictionId_organization_email: {
						tenantId: data.tenantId,
						eventId: data.eventId,
						participantTypeId: data.participantTypeId,
						restrictionId: data.restrictionId,
						organization: data.organization ?? '',
						email: data.email ?? '',
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

	const { id: invitationId, ...data } = submission.value

	await prisma.invitation.upsert({
		select: { id: true },
		where: { id: invitationId ?? '__new_invitation__' },
		create: {
			...data,
			maximumQuota: Number(data.maximumQuota),
			organization: data.organization ?? '',
			email: data.email ?? '',
		},
		update: {
			...data,
			maximumQuota: Number(data.maximumQuota),
			organization: data.organization ?? '',
			email: data.email ?? '',
		},
	})

	const action = invitationId ? AuditAction.UPDATE : AuditAction.CREATE
	const entityType = AuditEntityType.INVITATION
	const entityId = invitationId
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
				id: invitationId,
				...data,
			},
		},
	})

	return redirectWithToast(`/admin/events/${data.eventId}/invitations`, {
		type: 'success',
		title: `Invitation ${invitationId ? 'Updated' : 'Created'}`,
		description: `Invitation ${invitationId ? 'updated' : 'created'} successfully.`,
	})
}
