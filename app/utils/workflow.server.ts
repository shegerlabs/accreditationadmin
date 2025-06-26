import { Action, Participant, RequestStatus, Step } from '@prisma/client'
import { prisma } from '~/utils/db.server'
import { sendEmailAzure } from './email.server'

export async function processParticipant(
	participantId: string,
	userId: string,
	action: Action,
	remarks?: string,
) {
	const participant = await prisma.participant.findUniqueOrThrow({
		where: { id: participantId },
		include: {
			step: true,
		},
	})

	await logApproval(participant, userId, action, remarks)

	switch (action) {
		case Action.REJECT:
			await handleRejection(participant, userId, remarks)
			break
		case Action.APPROVE:
			await handleApproval(participant)
			break
		case Action.PRINT:
			await handlePrint(participant)
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
			result: action === Action.REJECT ? 'FAILURE' : 'SUCCESS',
			remarks: remarks ?? getRemarksByAction(action),
		},
	})
}

async function handleBypass(participant: Participant & { step: Step }) {
	const mofaPrintStep = await prisma.step.findFirst({
		where: {
			workflowId: participant.step.workflowId,
			name: 'MOFA Print',
		},
	})

	if (!mofaPrintStep) return

	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			stepId: mofaPrintStep.id,
			status: 'BYPASSED',
		},
	})
}

async function handleRejection(
	participant: Participant & { step: Step },
	userId: string,
	remarks?: string,
) {
	// Get the current step's role
	const currentStep = await prisma.step.findUnique({
		where: { id: participant.step.id },
		include: { role: true },
	})

	if (!currentStep) return

	let targetStep
	let newStatus: RequestStatus = RequestStatus.REJECTED // Default status

	// If rejected from Second Validator, go to First Validator and keep IN PROGRESS status
	if (currentStep.role.name === 'second-validator') {
		targetStep = await prisma.step.findFirst({
			where: {
				workflowId: participant.step.workflowId,
				role: { name: 'first-validator' },
			},
		})
		newStatus = RequestStatus.INPROGRESS // Keep IN PROGRESS status when going to First Validator
	}
	// If rejected from First Validator, go to Request Received with REJECTED status
	else if (currentStep.role.name === 'first-validator') {
		targetStep = await prisma.step.findFirst({
			where: {
				workflowId: participant.step.workflowId,
				name: 'Request Received',
			},
		})
		// Status remains REJECTED for First Validator rejections
	}
	// For any other role, go to Request Received with REJECTED status
	else {
		targetStep = await prisma.step.findFirst({
			where: {
				workflowId: participant.step.workflowId,
				name: 'Request Received',
			},
		})
		// Status remains REJECTED for other rejections
	}

	if (!targetStep) return

	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			stepId: targetStep.id,
			status: newStatus,
		},
	})

	// Only send rejection email if the status is REJECTED
	if (newStatus === RequestStatus.REJECTED) {
		await sendRejectionEmail(participant.email, remarks)
	}
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

async function handlePrint(participant: Participant & { step: Step }) {
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

	await sendFinalizationEmail(participant.email)
}

function getRemarksByAction(action: Action): string {
	switch (action) {
		case Action.APPROVE:
			return 'Approved successfully.'
		case Action.REJECT:
			return 'Rejected due to compliance issues.'
		case Action.PRINT:
			return 'Printed successfully.'
		case Action.NOTIFY:
			return 'Notification sent successfully.'
		case Action.ARCHIVE:
			return 'Archived successfully.'
		default:
			return 'Action processed.'
	}
}

async function sendRejectionEmail(email: string, remarks?: string) {
	void sendEmailAzure({
		to: email,
		subject: 'Request Rejected',
		plainText: 'Your request has been rejected.',
		html: `<p>Your request has been rejected. ${remarks ? `<br><br>${remarks}` : ''}</p>`,
	})
}

async function sendFinalizationEmail(email: string) {
	void sendEmailAzure({
		to: email,
		subject: 'Request Finalized',
		plainText: 'Your request has been finalized.',
		html: '<p>Your request has been finalized. You can collect your badge at the registration desk.</p>',
	})
}
