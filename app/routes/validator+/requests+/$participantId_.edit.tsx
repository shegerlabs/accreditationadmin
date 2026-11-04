import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { parseWithZod } from 'node_modules/@conform-to/zod/parse'
import { auditRequest } from '~/utils/audit.server'
import {
	getUserAccessibleStepIds,
	requireUserWithRoles,
} from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { getQuotaUsage, validateQuotaForTypeChange } from '~/utils/quota.server'
import { redirectWithToast } from '~/utils/toast.server'
import { reassignParticipantStep } from '~/utils/workflow.server'
import { WishlistEditor, WishlistEditorSchema } from './__wishlist-editor'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, [
		'validator',
		'reviewer',
	])

	// Get user's roles for backward compatibility
	const userRoles = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		include: {
			roles: true,
		},
	})

	// Try step-based filtering first (new multi-tenancy approach)
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['validator', 'reviewer'])

	// Build where clause: use step-based if available, otherwise fall back to role-based
	const stepFilter =
		accessibleStepIds.length > 0
			? { stepId: { in: accessibleStepIds } }
			: { step: { roleId: { in: userRoles.roles.map(role => role.id) } } }

	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: {
			id: participantId,
			...stepFilter,
		},
		select: {
			id: true,
			participantTypeId: true,
			wishList: true,
			attendClosedSession: true,
			invitationId: true,
		},
	})

	invariantResponse(participant, 'Access denied', { status: 403 })

	const quotaUsage = await getQuotaUsage(participant.id, participant.invitationId)

	const participantTypes = await prisma.participantType.findMany({
		select: { id: true, name: true },
	})

	return json({
		participant: {
			id: participant.id,
			participantTypeId: participant.participantTypeId,
			meetings: participant.wishList?.split(','),
			attendClosedSession: participant.attendClosedSession,
		},
		participantTypes,
		quotaUsage,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, [
		'validator',
		'reviewer',
	])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: WishlistEditorSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	// Get user's roles for backward compatibility
	const userRoles = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		include: {
			roles: true,
		},
	})

	// Try step-based filtering first (new multi-tenancy approach)
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['validator', 'reviewer'])

	// Build where clause: use step-based if available, otherwise fall back to role-based
	const stepFilter =
		accessibleStepIds.length > 0
			? { stepId: { in: accessibleStepIds } }
			: { step: { roleId: { in: userRoles.roles.map(role => role.id) } } }

	const { id: participantId } = submission.value

	// Verify access before update
	const participant = await prisma.participant.findFirst({
		where: {
			id: participantId,
			...stepFilter,
		},
		select: {
			id: true,
			eventId: true,
			tenantId: true,
			participantTypeId: true,
			invitationId: true,
			step: { select: { name: true, workflowId: true } },
		},
	})

	invariantResponse(participant, 'Access denied', { status: 403 })

	// Reassign step if participant type changed
	const newParticipantTypeId = submission.value.participantTypeId
	let newStepId: string | null = null
	if (participant.step) {
		try {
			newStepId = await reassignParticipantStep(participant as Parameters<typeof reassignParticipantStep>[0], newParticipantTypeId)
		} catch (error) {
			return json(
				{
					result: submission.reply({
						formErrors: [error instanceof Error ? error.message : 'Failed to reassign workflow step'],
					}),
				},
				{ status: 400 },
			)
		}
	}

	const newAttendClosedSession = submission.value.attendClosedSession === 'true'

	// Check quota before proceeding
	const quotaCheck = await validateQuotaForTypeChange({
		participantId: participant.id,
		invitationId: participant.invitationId,
		newParticipantTypeId,
		newAttendClosedSession,
	})

	if (!quotaCheck.allowed) {
		return json(
			{
				result: submission.reply({
					formErrors: [quotaCheck.reason ?? 'Quota exceeded for the selected participant type.'],
				}),
			},
			{ status: 400 },
		)
	}

	const wishlist = {
		wishList: submission.value.meetings?.join(','),
		attendClosedSession: newAttendClosedSession,
		participantTypeId: newParticipantTypeId,
		...(newStepId ? { stepId: newStepId } : {}),
	}

	await prisma.participant.update({
		where: { id: participantId },
		data: wishlist,
	})

	await auditRequest({
		request,
		action: AuditAction.UPDATE,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participantId,
		description: 'Participant wishlist updated',
		userId: user.id,
	})

	const url = new URL(request.url)
	const searchParams = url.searchParams
	const redirectUrl = `/validator/requests/${participantId}${searchParams.size ? '?' + searchParams.toString() : ''}`

	return redirectWithToast(redirectUrl, {
		type: 'success',
		title: `Participant Wishlist Updated`,
		description: `Participant wishlist updated successfully.`,
	})
}

export default function WishlistEditorRoute() {
	const { participant, participantTypes, quotaUsage } = useLoaderData<typeof loader>()
	return (
		<WishlistEditor
			participant={{
				id: participant.id,
				participantTypeId: participant.participantTypeId,
				meetings: participant.meetings ?? [],
				attendClosedSession: participant.attendClosedSession,
			}}
			participantTypes={participantTypes}
			quotaUsage={quotaUsage}
		/>
	)
}
