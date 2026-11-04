// profiles/auc.ts
// African Union Commission.
//
// Captured from the live `accreditation` database on 2026-09-03, which held
// these 28 participant types under the "African Union" tenant. This profile
// reproduces that catalogue exactly, so re-running setup for AUC restores the
// configuration the 49th Executive Council session ran on.

import { Priority } from '@prisma/client'
import { participantType, type OrganProfile } from './types.js'

const TWO_LEVEL = 'Two Levels Approval'
const ONE_LEVEL = 'One Level Approval'

export const auc: OrganProfile = {
	key: 'auc',
	label: 'AUC — African Union Commission',
	tenant: {
		name: 'African Union',
		email: 'admin@accreditation.com',
		phone: '+251911000000',
		website: 'https://au.int',
		address: 'Addis Ababa, Ethiopia',
		city: 'Addis Ababa',
		country: 'Ethiopia',
		subscriptionPlan: 'enterprise',
	},
	participantTypes: [
		participantType({
			name: 'A.A Police',
			description: 'A.A Police',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
		}),
		participantType({
			name: 'African Union',
			description: 'African Union',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
		}),
		participantType({
			name: 'Ambassador',
			description: 'Ambassador',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
			exempt: { fromFullQuota: true },
		}),
		participantType({
			name: 'Any',
			description: 'Any participant',
			priority: Priority.MEDIUM,
			workflowTemplate: TWO_LEVEL,
		}),
		participantType({
			name: 'Armed Security',
			description: 'Armed Security',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
		}),
		participantType({
			name: 'Delegate',
			description: 'Delegate',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
		}),
		participantType({
			name: 'Driver',
			description: 'Driver',
			priority: Priority.LOW,
			workflowTemplate: ONE_LEVEL,
			exempt: { fromFullQuota: true },
		}),
		participantType({
			name: 'Federal Police',
			description: 'Federal Police',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
			exempt: { fromFullQuota: true },
		}),
		participantType({
			name: 'First Lady',
			description: 'First Lady',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
			exempt: {
				fromFullQuota: true,
				fromOpenSessionQuota: true,
				fromClosedSessionQuota: true,
			},
		}),
		participantType({
			name: 'Head of Delegation',
			description: 'Head of Delegation',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
		}),
		participantType({
			name: 'Hotel External',
			description: 'Hotel serving outside AU',
			priority: Priority.LOW,
			workflowTemplate: ONE_LEVEL,
		}),
		participantType({
			name: 'Hotel Internal',
			description: 'Hotel serving inside AU',
			priority: Priority.LOW,
			workflowTemplate: ONE_LEVEL,
		}),
		participantType({
			name: 'Medical Team',
			description: 'Medical Team',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
		}),
		participantType({
			name: 'Minister',
			description: 'Minister',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
		}),
		participantType({
			name: 'N - Delegate',
			description: 'N - Delegate',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
		}),
		participantType({
			name: 'Non Armed Security',
			description: 'Non Armed Security',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
			exempt: { fromFullQuota: true },
		}),
		participantType({
			name: 'Observer',
			description: 'Observer',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
		}),
		participantType({
			name: 'Observer Ambassador',
			description: 'Observer Ambassador',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
		}),
		participantType({
			name: 'PRC-Ambassador',
			description: 'PRC-Ambassador',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
			exempt: { fromFullQuota: true },
		}),
		participantType({
			name: 'Press / Media',
			description: 'Press / Media',
			priority: Priority.MEDIUM,
			workflowTemplate: TWO_LEVEL,
			exempt: { fromFullQuota: true },
		}),
		participantType({
			name: 'Protocol',
			description: 'Protocol',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
			exempt: { fromOpenSessionQuota: true, fromClosedSessionQuota: true },
		}),
		participantType({
			name: 'Protocol MFA',
			description: 'Protocol MFA',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
		}),
		participantType({
			name: 'Security Driver',
			description: 'Security Driver',
			priority: Priority.HIGH,
			workflowTemplate: ONE_LEVEL,
		}),
		participantType({
			name: 'Service Provider',
			description: 'Service Provider',
			priority: Priority.HIGH,
			workflowTemplate: ONE_LEVEL,
		}),
		participantType({
			name: 'Special Armed Security',
			description: 'Special Armed Security',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
		}),
		participantType({
			name: 'Special Guest',
			description: 'Special Guest',
			priority: Priority.HIGH,
			workflowTemplate: TWO_LEVEL,
			exempt: { fromFullQuota: true },
		}),
		participantType({
			name: 'Support',
			description: 'Support',
			priority: Priority.HIGH,
			workflowTemplate: ONE_LEVEL,
		}),
		participantType({
			name: 'Usher',
			description: 'Usher',
			priority: Priority.MEDIUM,
			workflowTemplate: ONE_LEVEL,
		}),
	],
	// The per-type template assignments are this script's suggestion, not a
	// capture: the live DB's 27 workflows are indistinguishable by template once
	// cloned. Override at the prompt, or pick one template for all.
	unverifiedFields: ['participantTypes[].workflowTemplate'],
}
