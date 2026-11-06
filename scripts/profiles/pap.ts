// profiles/pap.ts
// Pan-African Parliament, the only organ this deployment serves.
//
// The 17 participant types are the catalogue PAP supplied on 2026-11-06, plus
// "Any", the catch-all quota type every tenant needs (it never gets a workflow).
// prisma/seed.ts seeds from this profile too, so the two can't drift apart.

import { Priority } from '@prisma/client'
import { participantType, type OrganProfile } from './types.js'

const TWO_LEVEL = 'Two Levels Approval'
const ONE_LEVEL = 'One Level Approval'

/**
 * Quota exemptions are left at their defaults (all false): an exemption
 * LOOSENS enforcement, so granting one by guesswork is the dangerous direction.
 * Tune them in the admin UI once the real quotas are known.
 */
export const pap: OrganProfile = {
	key: 'pap',
	label: 'PAP — Pan-African Parliament',
	tenant: {
		// Contact details are unconfirmed, see unverifiedFields below.
		name: 'Pan-African Parliament',
		email: 'pap@accreditation.com',
		phone: '+27115455000',
		website: 'https://pap.au.int',
		address: 'Gallagher Convention Centre, Midrand',
		city: 'Midrand',
		country: 'South Africa',
		subscriptionPlan: 'enterprise',
	},
	participantTypes: [
		t('Bureau', 'Bureau', Priority.HIGH, TWO_LEVEL),
		t('MP', 'Member of Parliament', Priority.HIGH, TWO_LEVEL),
		t('PAP Staff', 'PAP Staff', Priority.MEDIUM, ONE_LEVEL),
		t('AU Staff', 'AU Staff', Priority.MEDIUM, ONE_LEVEL),
		t(
			'Diplomatic Corps',
			'Diplomatic Corps (including Ambassadors)',
			Priority.HIGH,
			TWO_LEVEL,
		),
		t('Security Clusters', 'Security Clusters', Priority.HIGH, TWO_LEVEL),
		t('Entertainers', 'Entertainers', Priority.LOW, ONE_LEVEL),
		t('Media', 'Media', Priority.MEDIUM, ONE_LEVEL),
		t('Support Staff', 'Support Staff', Priority.LOW, ONE_LEVEL),
		t(
			'Host Country Officials',
			'Host Country Officials',
			Priority.HIGH,
			TWO_LEVEL,
		),
		t('Guests', 'Guests', Priority.MEDIUM, ONE_LEVEL),
		t('Special Guests', 'Special Guests', Priority.HIGH, ONE_LEVEL),
		t('Observers', 'Observers', Priority.MEDIUM, ONE_LEVEL),
		t('VIPs', 'VIPs', Priority.HIGH, TWO_LEVEL),
		t('VVIPs', 'VVIPs', Priority.HIGH, TWO_LEVEL),
		t('Service Providers', 'Service Providers', Priority.LOW, ONE_LEVEL),
		t('Others', 'Others', Priority.LOW, ONE_LEVEL),
		t('Any', 'Any participant', Priority.MEDIUM, ONE_LEVEL),
	],
	// The meeting types PAP supplied on 2026-11-06.
	meetingTypes: [
		{
			name: 'Ordinary Session',
			description: 'Ordinary Session of the Pan-African Parliament',
		},
		{
			name: 'Committees Session',
			description: 'Sittings of the permanent committees',
		},
		{
			name: 'Conference',
			description: 'Conferences hosted or organised by the Parliament',
		},
		{
			name: 'AU meetings',
			description: 'Meetings of African Union organs and bodies',
		},
		{
			name: 'Joint Meetings',
			description: 'Meetings held jointly with other bodies',
		},
		{ name: 'Other meetings', description: 'Meetings that fit no other type' },
	],
	unverifiedFields: [
		'tenant.email (placeholder, follows the existing @accreditation.com pattern)',
		'tenant.phone/address/city (PAP seat in Midrand, not confirmed)',
		'participantTypes[].priority (assigned by inference, not supplied)',
		'meetingTypes[].description (written here, PAP supplied names only)',
		'participantTypes[].workflowTemplate (Two Levels for Bureau, MP, Diplomatic Corps, Security Clusters, Host Country Officials, VIPs and VVIPs; One Level for the rest; not confirmed)',
	],
}

function t(
	name: string,
	description: string,
	priority: Priority,
	workflowTemplate: string,
) {
	return participantType({ name, description, priority, workflowTemplate })
}
