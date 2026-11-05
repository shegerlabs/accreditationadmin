import {
	Action,
	type Participant,
	type Prisma,
	type Step,
} from '@prisma/client'
import { json } from '@remix-run/node'
import { prisma } from '~/utils/db.server'
import { sendParticipantEmail } from './participant-email.server'

export async function processParticipant(
	participantId: string,
	userId: string,
	action: Action,
	remarks?: string,
	// Shown to the participant in the rejection email. `remarks` is internal
	// and can name the validator, so it is never emailed.
	participantReason?: string,
) {
	const participant = await prisma.participant.findUniqueOrThrow({
		where: { id: participantId },
		include: {
			step: true,
		},
	})

	let outcome: Outcome
	switch (action) {
		case Action.REJECT:
			outcome = await handleRejection(participant, userId, participantReason)
			break
		case Action.APPROVE:
			outcome = await handleApproval(participant)
			break
		case Action.PRINT:
			outcome = await handlePrint(participant, userId)
			break
		case Action.COLLECT:
			outcome = handleCollect(participant, userId)
			break
		case Action.NOTIFY:
			outcome = await handleNotify(participant)
			break
		case Action.ARCHIVE:
			outcome = handleArchive()
			break
		case Action.BYPASS:
			outcome = await handleBypass(participant)
			break
		default:
			throw new Error(`Unsupported action: ${action}`)
	}

	await prisma.$transaction(async tx => {
		if (outcome.data) {
			// Only update if nobody moved the participant since we read it.
			// Without this, two users acting at once (or one on a stale page)
			// both advance the participant and it skips a step.
			const { count } = await tx.participant.updateMany({
				where: {
					id: participant.id,
					stepId: participant.stepId,
					status: participant.status,
				},
				data: outcome.data,
			})
			if (count === 0) {
				throw json(PARTICIPANT_CONFLICT_MESSAGE, { status: 409 })
			}
		}
		await tx.approval.create({
			data: {
				participantId: participant.id,
				stepId: participant.step.id,
				userId,
				action,
				result: action === Action.REJECT ? 'FAILURE' : 'SUCCESS',
				remarks: remarks ?? getRemarksByAction(action),
			},
		})
	})

	if (outcome.email) void sendParticipantEmail(outcome.email)
}

export const PARTICIPANT_CONFLICT_MESSAGE =
	'Someone else has already processed this participant. Go back and refresh the list to see where it is now.'

type Outcome = {
	// null when the action leaves the participant unchanged (e.g. approving the last step)
	data: (Prisma.ParticipantUpdateManyMutationInput & { stepId?: string }) | null
	email?: Parameters<typeof sendParticipantEmail>[0]
}

async function handleBypass(
	participant: Participant & { step: Step },
): Promise<Outcome> {
	// Find step marked as bypass target (e.g., Badge Print step)
	const bypassTargetStep = await prisma.step.findFirst({
		where: {
			workflowId: participant.step.workflowId,
			isBypassTarget: true,
		},
	})

	if (!bypassTargetStep) {
		throw new Error(
			'No bypass target configured for this workflow. Please mark a step as the bypass target in workflow settings.',
		)
	}

	return { data: { stepId: bypassTargetStep.id, status: 'BYPASSED' } }
}

async function handleRejection(
	participant: Participant & { step: Step },
	userId: string,
	participantReason?: string,
): Promise<Outcome> {
	// Find step marked as rejection target (where rejected participants return)
	const rejectionTargetStep = await prisma.step.findFirst({
		where: {
			workflowId: participant.step.workflowId,
			isRejectionTarget: true,
		},
	})

	if (!rejectionTargetStep) {
		throw new Error(
			'No rejection target configured for this workflow. Please mark a step as the rejection target in workflow settings.',
		)
	}

	return {
		data: { stepId: rejectionTargetStep.id, status: 'REJECTED' },
		email: {
			participantId: participant.id,
			trigger: 'RETURNED_FOR_CORRECTION',
			remarks: participantReason,
			triggeredById: userId,
		},
	}
}

async function handleApproval(
	participant: Participant & { step: Step },
): Promise<Outcome> {
	if (!participant.step.nextStepId) return { data: null }
	return { data: { stepId: participant.step.nextStepId, status: 'INPROGRESS' } }
}

async function handlePrint(
	participant: Participant & { step: Step },
	userId: string,
): Promise<Outcome> {
	if (!participant.step.nextStepId) return { data: null }
	return {
		data: { stepId: participant.step.nextStepId, status: 'PRINTED' },
		email: {
			participantId: participant.id,
			trigger: 'BADGE_READY',
			triggeredById: userId,
		},
	}
}

function handleCollect(
	participant: Participant & { step: Step },
	userId: string,
): Outcome {
	// COLLECT does NOT move to next step - participant stays in current step
	// with COLLECTED status. Admin will later archive them.
	return {
		data: { status: 'COLLECTED' },
		email: {
			participantId: participant.id,
			trigger: 'BADGE_COLLECTED',
			triggeredById: userId,
		},
	}
}

async function handleNotify(
	participant: Participant & { step: Step },
): Promise<Outcome> {
	if (!participant.step.nextStepId) return { data: null }
	return { data: { stepId: participant.step.nextStepId, status: 'NOTIFIED' } }
}

function handleArchive(): Outcome {
	return { data: { status: 'ARCHIVED' } }
}

function getRemarksByAction(action: Action): string {
	switch (action) {
		case Action.APPROVE:
			return 'Request approved and forwarded to next validation stage'
		case Action.REJECT:
			return 'Request rejected and returned to applicant for revision'
		case Action.PRINT:
			return 'Badge printed and ready for collection'
		case Action.COLLECT:
			return 'Badge collected by participant'
		case Action.NOTIFY:
			return 'Applicant notified of accreditation status'
		case Action.ARCHIVE:
			return 'Accreditation completed and archived'
		case Action.BYPASS:
			return 'Validation steps bypassed by administrator - sent directly to badge printing'
		default:
			return 'Action processed'
	}
}

/**
 * When a participant's type changes, find the matching step in the new type's workflow.
 * Returns the new stepId, or null if the type didn't change.
 * Throws if no workflow or matching step exists for the new type.
 */
export async function reassignParticipantStep(
	participant: {
		eventId: string
		tenantId: string
		participantTypeId: string
		step: { name: string; workflowId: string }
	},
	newParticipantTypeId: string,
): Promise<string | null> {
	if (participant.participantTypeId === newParticipantTypeId) {
		return null
	}

	const workflow = await prisma.workflow.findFirst({
		where: {
			tenantId: participant.tenantId,
			eventId: participant.eventId,
			participantTypeId: newParticipantTypeId,
		},
		select: { id: true },
	})

	if (!workflow) {
		throw new Error(
			'No workflow is configured for the selected participant type in this event. Please set up a workflow before changing the type.',
		)
	}

	const matchingStep = await prisma.step.findFirst({
		where: {
			workflowId: workflow.id,
			name: participant.step.name,
		},
		select: { id: true },
	})

	if (!matchingStep) {
		throw new Error(
			`The new participant type's workflow has no step named "${participant.step.name}". Cannot reassign participant.`,
		)
	}

	return matchingStep.id
}
