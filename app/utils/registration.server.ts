import { customAlphabet } from 'nanoid'
import { prisma } from './db.server'
import { createWizard } from './wizard.server'

export const registrationWizard = createWizard({
	name: 'registration',
	routes: [
		'/admin/participants/general',
		'/admin/participants/professional',
		'/admin/participants/wishlist',
		'/admin/participants/documents',
	],
	onStepChange: (_current, _next) => {},
	validateStep: (_data, _currentStep) => {
		return true
	},
})

export const validatorWizard = createWizard({
	name: 'registration',
	routes: [
		'/validator/requests/general',
		'/validator/requests/professional',
		'/validator/requests/wishlist',
		'/validator/requests/documents',
	],
	onStepChange: (_current, _next) => {},
	validateStep: (_data, _currentStep) => {
		return true
	},
})

export const participantWizard = createWizard({
	name: 'registration',
	routes: [
		'/participant/requests/general',
		'/participant/requests/professional',
		'/participant/requests/wishlist',
		'/participant/requests/documents',
	],
	onStepChange: (_current, _next) => {},
	validateStep: (_data, _currentStep) => {
		return true
	},
})

export const focalWizard = createWizard({
	name: 'registration',
	routes: [
		'/focal/requests/general',
		'/focal/requests/professional',
		'/focal/requests/wishlist',
		'/focal/requests/documents',
	],
	onStepChange: (_current, _next) => {},
	validateStep: (_data, _currentStep) => {
		return true
	},
})

const generateSuffix = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 4)

export async function createRegistrationCode(
	eventId: string,
	participantTypeId: string,
): Promise<string> {
	const [event, participantType] = await Promise.all([
		prisma.event.findUnique({
			where: { id: eventId },
			select: { name: true, startDate: true },
		}),
		prisma.participantType.findUnique({
			where: { id: participantTypeId },
			select: { name: true },
		}),
	])

	const eventPrefix = event?.name.slice(0, 3).toUpperCase() || 'EVT'
	const typePrefix = participantType?.name.slice(0, 2).toUpperCase() || 'PT'
	const year = event?.startDate.getFullYear().toString().slice(-2)
	const randomSuffix = generateSuffix()

	return `${eventPrefix}-${typePrefix}-${year}-${randomSuffix}`
}
