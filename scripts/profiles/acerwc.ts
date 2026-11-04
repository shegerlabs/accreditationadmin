// profiles/acerwc.ts
// African Committee of Experts on the Rights and Welfare of the Child.
//
// The 21 participant types below are the catalogue supplied for the 48th
// Ordinary Session. Five of them (Delegate, Service Provider, Protocol,
// Minister, Driver) also exist in the AUC profile; the rest are ACERWC-only,
// and this profile deliberately drops the 23 AUC types that do not appear here.

import { Priority } from '@prisma/client'
import { participantType, type OrganProfile } from './types.js'

const ONE_LEVEL = 'One Level Approval'

/**
 * Quota exemptions are left at their defaults (all false) throughout: an
 * exemption LOOSENS enforcement, so granting one by guesswork is the dangerous
 * direction. Tune them in the admin UI once the real quotas are known.
 */
export const acerwc: OrganProfile = {
	key: 'acerwc',
	label:
		'ACERWC — African Committee of Experts on the Rights and Welfare of the Child',
	tenant: {
		// PLACEHOLDER contact details — see unverifiedFields below.
		name: 'ACERWC',
		email: 'acerwc@accreditation.com',
		phone: '+251911000000',
		website: 'https://www.acerwc.africa',
		address: 'Addis Ababa, Ethiopia',
		city: 'Addis Ababa',
		country: 'Ethiopia',
		subscriptionPlan: 'enterprise',
	},
	participantTypes: [
		t('ACERWC Member', 'ACERWC Member', Priority.HIGH),
		t('ACERWC Secretariat', 'ACERWC Secretariat', Priority.HIGH),
		t('AU Organ', 'AU Organ', Priority.HIGH),
		t('AUC', 'African Union Commission', Priority.HIGH),
		t('CSO', 'Civil Society Organisation', Priority.MEDIUM),
		t('Chaperone', 'Chaperone', Priority.MEDIUM),
		t('Child Representative', 'Child Representative', Priority.HIGH),
		t('Delegate', 'Delegate', Priority.HIGH),
		t('Driver', 'Driver', Priority.LOW),
		t(
			'International Organization',
			'International Organization',
			Priority.MEDIUM,
		),
		t('Mayor', 'Mayor', Priority.HIGH),
		t('Media', 'Media', Priority.MEDIUM),
		t('Medical', 'Medical', Priority.HIGH),
		t('Minister', 'Minister', Priority.HIGH),
		t('NHRI', 'National Human Rights Institution', Priority.MEDIUM),
		t('NSS', 'National Security Service', Priority.HIGH),
		t('Protocol', 'Protocol', Priority.HIGH),
		t('Security', 'Security', Priority.HIGH),
		t('Service Provider', 'Service Provider', Priority.HIGH),
		t('UN Agency', 'UN Agency', Priority.MEDIUM),
		t('Working Group Expert', 'Working Group Expert', Priority.HIGH),
	],
	suggestedEvent: {
		name: '48TH ORDINARY SESSION OF THE AFRICAN COMMITTEE OF EXPERTS ON THE RIGHTS AND WELFARE OF THE CHILD (ACERWC)',
		description:
			'48th Ordinary Session of the African Committee of Experts on the Rights and Welfare of the Child (ACERWC)',
		location: 'Maseru, Kingdom of Lesotho',
		startDate: '2026-10-13',
		endDate: '2026-10-20',
		// Lesotho is SAST, UTC+2 — one hour behind the Addis-based AUC events.
		utcOffset: '+02:00',
	},
	unverifiedFields: [
		'tenant.email (placeholder, follows the existing @accreditation.com pattern)',
		'tenant.phone (copied from the AUC tenant)',
		'tenant.address/city/country (ACERWC Secretariat location not confirmed)',
		'participantTypes[].priority (assigned by inference, not supplied)',
		'participantTypes[].workflowTemplate (defaulted to One Level Approval for every type)',
	],
}

/** Local shorthand: every ACERWC type shares a template and takes no exemptions. */
function t(name: string, description: string, priority: Priority) {
	return participantType({
		name,
		description,
		priority,
		workflowTemplate: ONE_LEVEL,
	})
}
