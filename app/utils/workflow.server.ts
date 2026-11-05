import { Action, Participant, Step } from '@prisma/client'
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

	// Execute action first, then log approval only if successful
	switch (action) {
		case Action.REJECT:
			await handleRejection(participant, userId, participantReason)
			break
		case Action.APPROVE:
			await handleApproval(participant)
			break
		case Action.PRINT:
			await handlePrint(participant, userId)
			break
		case Action.COLLECT:
			await handleCollect(participant, userId)
			break
		case Action.NOTIFY:
			await handleNotify(participant)
			break
		case Action.ARCHIVE:
			await handleArchive(participant)
			break
		case Action.BYPASS:
			await handleBypass(participant)
			break
		default:
			throw new Error(`Unsupported action: ${action}`)
	}

	// Log approval only after action succeeds
	await logApproval(participant, userId, action, remarks)
}

async function logApproval(
	participant: Participant & { step: Step },
	userId: string,
	action: Action,
	remarks?: string,
) {
	await prisma.approval.create({
		data: {
			participantId: participant.id,
			stepId: participant.step.id,
			userId: userId,
			action: action,
			result: action === Action.REJECT ? 'FAILURE' : 'SUCCESS',
			remarks: remarks ?? getRemarksByAction(action),
		},
	})
}

async function handleBypass(participant: Participant & { step: Step }) {
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

	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			stepId: bypassTargetStep.id,
			status: 'BYPASSED',
		},
	})
}

async function handleRejection(
	participant: Participant & { step: Step },
	userId: string,
	participantReason?: string,
) {
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

	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			stepId: rejectionTargetStep.id,
			status: 'REJECTED',
		},
	})

	void sendParticipantEmail({
		participantId: participant.id,
		trigger: 'RETURNED_FOR_CORRECTION',
		remarks: participantReason,
		triggeredById: userId,
	})
}

async function handleApproval(participant: Participant & { step: Step }) {
	if (!participant.step.nextStepId) return

	const nextStep = await prisma.step.findUniqueOrThrow({
		where: { id: participant.step.nextStepId },
	})

	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			stepId: nextStep.id,
			status: 'INPROGRESS',
		},
	})
}

async function handlePrint(participant: Participant & { step: Step }, userId: string) {
	if (!participant.step.nextStepId) return

	const nextStep = await prisma.step.findUniqueOrThrow({
		where: { id: participant.step.nextStepId },
	})

	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			stepId: nextStep.id,
			status: 'PRINTED',
		},
	})

	void sendParticipantEmail({
		participantId: participant.id,
		trigger: 'BADGE_READY',
		triggeredById: userId,
	})
}

async function handleCollect(participant: Participant & { step: Step }, userId: string) {
	// COLLECT does NOT move to next step - participant stays in current step
	// with COLLECTED status. Admin will later archive them.
	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			status: 'COLLECTED',
		},
	})

	void sendParticipantEmail({
		participantId: participant.id,
		trigger: 'BADGE_COLLECTED',
		triggeredById: userId,
	})
}

async function handleNotify(participant: Participant & { step: Step }) {
	if (!participant.step.nextStepId) return

	const nextStep = await prisma.step.findUniqueOrThrow({
		where: { id: participant.step.nextStepId },
	})

	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			stepId: nextStep.id,
			status: 'NOTIFIED',
		},
	})
}

async function handleArchive(participant: Participant & { step: Step }) {
	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			status: 'ARCHIVED',
		},
	})
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
