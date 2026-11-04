// Field registry for Custom Report Builder
// This defines the whitelisted fields that can be used in custom reports

import type { DataSourceType, FieldType } from './custom-report-types'

export interface FieldDefinition {
	path: string // e.g., 'firstName' or 'participantType.name'
	label: string // Display name
	type: FieldType
	enumValues?: string[] // For enum fields
	relation?: string // e.g., 'participantType' for 'participantType.name'
	description?: string
}

// Data source metadata
export interface DataSourceInfo {
	name: DataSourceType
	label: string
	description: string
	icon: string // Lucide icon name
	primaryField: string // Primary display field for listings
}

export const DATA_SOURCES: DataSourceInfo[] = [
	{
		name: 'Participant',
		label: 'Participants',
		description:
			'Registered participants with personal info, status, and workflow progress',
		icon: 'Users',
		primaryField: 'registrationCode',
	},
	{
		name: 'Invitation',
		label: 'Invitations',
		description: 'Invitation quotas and usage by organization',
		icon: 'Mail',
		primaryField: 'organization',
	},
	{
		name: 'AuditLog',
		label: 'Audit Logs',
		description: 'System audit trail with user actions and metadata',
		icon: 'FileText',
		primaryField: 'id',
	},
	{
		name: 'ParticipantType',
		label: 'Participant Types',
		description: 'Participant categories with priority and quota exemptions',
		icon: 'Tag',
		primaryField: 'name',
	},
	{
		name: 'Country',
		label: 'Countries',
		description: 'Country reference data with codes',
		icon: 'Globe',
		primaryField: 'name',
	},
	{
		name: 'Restriction',
		label: 'Restrictions',
		description: 'Event restrictions and quota constraints',
		icon: 'Shield',
		primaryField: 'name',
	},
]

// Field definitions for each data source
// These are whitelisted fields that are safe to expose in reports

const PARTICIPANT_FIELDS: FieldDefinition[] = [
	{
		path: 'id',
		label: 'ID',
		type: 'string',
		description: 'Unique participant identifier',
	},
	{
		path: 'registrationCode',
		label: 'Registration Code',
		type: 'string',
		description: 'Human-readable registration code',
	},
	{ path: 'firstName', label: 'First Name', type: 'string' },
	{ path: 'familyName', label: 'Family Name', type: 'string' },
	{
		path: 'gender',
		label: 'Gender',
		type: 'enum',
		enumValues: ['Male', 'Female', 'Other'],
	},
	{ path: 'dateOfBirth', label: 'Date of Birth', type: 'date' },
	{ path: 'organization', label: 'Organization', type: 'string' },
	{ path: 'jobTitle', label: 'Job Title', type: 'string' },
	{ path: 'email', label: 'Email', type: 'string' },
	{ path: 'telephone', label: 'Telephone', type: 'string' },
	{ path: 'city', label: 'City', type: 'string' },
	{ path: 'passportNumber', label: 'Passport Number', type: 'string' },
	{ path: 'passportExpiry', label: 'Passport Expiry', type: 'date' },
	{
		path: 'status',
		label: 'Status',
		type: 'enum',
		enumValues: [
			'PENDING',
			'INPROGRESS',
			'APPROVED',
			'REJECTED',
			'CANCELLED',
			'PRINTED',
			'COLLECTED',
			'NOTIFIED',
			'ARCHIVED',
			'BYPASSED',
		],
	},
	{
		path: 'attendClosedSession',
		label: 'Closed Session Access',
		type: 'boolean',
	},
	{ path: 'needsVisa', label: 'Needs Visa', type: 'boolean' },
	{ path: 'needsCarPass', label: 'Needs Car Pass', type: 'boolean' },
	{ path: 'vehicleType', label: 'Vehicle Type', type: 'string' },
	{ path: 'vehiclePlateNumber', label: 'Vehicle Plate Number', type: 'string' },
	{
		path: 'needsCarFromOrganizer',
		label: 'Needs Car From Organizer',
		type: 'boolean',
	},
	{ path: 'flightNumber', label: 'Flight Number', type: 'string' },
	{ path: 'arrivalDate', label: 'Arrival Date', type: 'date' },
	{ path: 'collectedBy', label: 'Collected By', type: 'string' },
	{ path: 'collectedAt', label: 'Collected At', type: 'date' },
	{ path: 'reprintCount', label: 'Reprint Count', type: 'number' },
	{ path: 'createdAt', label: 'Registration Date', type: 'date' },
	{ path: 'updatedAt', label: 'Last Updated', type: 'date' },
	// Relations
	{
		path: 'participantType.name',
		label: 'Participant Type',
		type: 'string',
		relation: 'participantType',
	},
	{
		path: 'nationality.name',
		label: 'Nationality',
		type: 'string',
		relation: 'nationality',
	},
	{
		path: 'country.name',
		label: 'Country',
		type: 'string',
		relation: 'country',
	},
	{
		path: 'event.name',
		label: 'Event',
		type: 'string',
		relation: 'event',
	},
	{
		path: 'step.name',
		label: 'Current Step',
		type: 'string',
		relation: 'step',
	},
	{
		path: 'step.action',
		label: 'Current Step Action',
		type: 'enum',
		relation: 'step',
		enumValues: [
			'APPROVE',
			'REJECT',
			'NOTIFY',
			'PRINT',
			'COLLECT',
			'ARCHIVE',
			'CANCEL',
			'BYPASS',
			'REPRINT',
		],
	},
	{
		path: 'title.name',
		label: 'Title',
		type: 'string',
		relation: 'title',
	},
	{
		path: 'invitation.organization',
		label: 'Invitation Organization',
		type: 'string',
		relation: 'invitation',
	},
]

const INVITATION_FIELDS: FieldDefinition[] = [
	{ path: 'id', label: 'ID', type: 'string' },
	{ path: 'organization', label: 'Organization', type: 'string' },
	{ path: 'name', label: 'Contact Name', type: 'string' },
	{ path: 'email', label: 'Email', type: 'string' },
	{ path: 'maximumQuota', label: 'Maximum Quota', type: 'number' },
	{ path: 'createdAt', label: 'Created Date', type: 'date' },
	{ path: 'updatedAt', label: 'Last Updated', type: 'date' },
	// Relations
	{
		path: 'event.name',
		label: 'Event',
		type: 'string',
		relation: 'event',
	},
	{
		path: 'participantType.name',
		label: 'Participant Type',
		type: 'string',
		relation: 'participantType',
	},
	{
		path: 'restriction.name',
		label: 'Restriction',
		type: 'string',
		relation: 'restriction',
	},
]

const AUDIT_LOG_FIELDS: FieldDefinition[] = [
	{ path: 'id', label: 'ID', type: 'string' },
	{
		path: 'action',
		label: 'Action',
		type: 'enum',
		enumValues: [
			'CREATE',
			'UPDATE',
			'DELETE',
			'LOGIN',
			'LOGIN_FAILED',
			'LOGOUT',
			'PASSWORD_RESET',
			'PASSWORD_CHANGE',
			'TWO_FACTOR_ENABLE',
			'TWO_FACTOR_DISABLE',
			'SESSION_REVOKE',
			'APPROVE',
			'REJECT',
			'EXPORT',
			'IMPORT',
			'PRINT',
			'COLLECT',
			'BYPASS',
			'REPRINT',
			'OTHER',
		],
	},
	{
		path: 'entityType',
		label: 'Entity Type',
		type: 'enum',
		enumValues: [
			'TENANT',
			'USER',
			'ROLE',
			'PERMISSION',
			'MENU',
			'MENU_ITEM',
			'PARTICIPANT',
			'PARTICIPANT_TYPE',
			'EVENT',
			'MEETING',
			'MEETING_TYPE',
			'VENUE',
			'WORKFLOW',
			'STEP',
			'STEP_TEMPLATE',
			'INVITATION',
			'INVITATION_CONSTRAINT',
			'TEMPLATE',
			'BADGE_TEMPLATE',
			'RESTRICTION',
			'RESTRICTION_CONSTRAINT',
			'COUNTRY',
			'TITLE',
			'SESSION',
			'SYSTEM',
			'BACKUP',
			'OTHER',
		],
	},
	{ path: 'entityId', label: 'Entity ID', type: 'string' },
	{ path: 'description', label: 'Description', type: 'string' },
	{ path: 'ipAddress', label: 'IP Address', type: 'string' },
	{ path: 'userAgent', label: 'User Agent', type: 'string' },
	{ path: 'createdAt', label: 'Timestamp', type: 'date' },
	// Relations
	{
		path: 'user.name',
		label: 'User Name',
		type: 'string',
		relation: 'user',
	},
	{
		path: 'user.username',
		label: 'Username',
		type: 'string',
		relation: 'user',
	},
]

const PARTICIPANT_TYPE_FIELDS: FieldDefinition[] = [
	{ path: 'id', label: 'ID', type: 'string' },
	{ path: 'name', label: 'Name', type: 'string' },
	{ path: 'description', label: 'Description', type: 'string' },
	{
		path: 'priority',
		label: 'Priority',
		type: 'enum',
		enumValues: ['LOW', 'MEDIUM', 'HIGH'],
	},
	{ path: 'isExemptedFromFullQuota', label: 'Exempt from Full Quota', type: 'boolean' },
	{ path: 'isExemptedFromOpenSessionQuota', label: 'Exempt from Open Session Quota', type: 'boolean' },
	{ path: 'isExemptedFromClosedSessionQuota', label: 'Exempt from Closed Session Quota', type: 'boolean' },
	{ path: 'createdAt', label: 'Created Date', type: 'date' },
	{ path: 'updatedAt', label: 'Last Updated', type: 'date' },
]

const COUNTRY_FIELDS: FieldDefinition[] = [
	{ path: 'id', label: 'ID', type: 'string' },
	{ path: 'name', label: 'Name', type: 'string' },
	{ path: 'code', label: 'Code', type: 'string' },
	{ path: 'createdAt', label: 'Created Date', type: 'date' },
	{ path: 'updatedAt', label: 'Last Updated', type: 'date' },
]

const RESTRICTION_FIELDS: FieldDefinition[] = [
	{ path: 'id', label: 'ID', type: 'string' },
	{ path: 'name', label: 'Name', type: 'string' },
	{ path: 'createdAt', label: 'Created Date', type: 'date' },
	{ path: 'updatedAt', label: 'Last Updated', type: 'date' },
	// Relations
	{
		path: 'event.name',
		label: 'Event',
		type: 'string',
		relation: 'event',
	},
]

// Field registry by data source
export const FIELD_REGISTRY: Record<DataSourceType, FieldDefinition[]> = {
	Participant: PARTICIPANT_FIELDS,
	Invitation: INVITATION_FIELDS,
	AuditLog: AUDIT_LOG_FIELDS,
	ParticipantType: PARTICIPANT_TYPE_FIELDS,
	Country: COUNTRY_FIELDS,
	Restriction: RESTRICTION_FIELDS,
}

// Get fields for a data source
export function getFieldsForDataSource(
	dataSource: DataSourceType,
): FieldDefinition[] {
	return FIELD_REGISTRY[dataSource] || []
}

// Get a specific field definition
export function getFieldDefinition(
	dataSource: DataSourceType,
	path: string,
): FieldDefinition | undefined {
	return getFieldsForDataSource(dataSource).find((f) => f.path === path)
}

// Get fields grouped by category (direct vs relation)
export function getFieldsGrouped(dataSource: DataSourceType): {
	direct: FieldDefinition[]
	relations: Map<string, FieldDefinition[]>
} {
	const fields = getFieldsForDataSource(dataSource)
	const direct: FieldDefinition[] = []
	const relations = new Map<string, FieldDefinition[]>()

	for (const field of fields) {
		if (field.relation) {
			const existing = relations.get(field.relation) || []
			existing.push(field)
			relations.set(field.relation, existing)
		} else {
			direct.push(field)
		}
	}

	return { direct, relations }
}

// Validate that fields are allowed for a data source
export function validateFields(
	dataSource: DataSourceType,
	fieldPaths: string[],
): { valid: boolean; invalidFields: string[] } {
	const allowedPaths = getFieldsForDataSource(dataSource).map((f) => f.path)
	const invalidFields = fieldPaths.filter((p) => !allowedPaths.includes(p))
	return {
		valid: invalidFields.length === 0,
		invalidFields,
	}
}

// Get operators allowed for a field type
export function getOperatorsForType(
	type: FieldType,
): { value: string; label: string }[] {
	const baseOperators = [
		{ value: 'equals', label: 'Equals' },
		{ value: 'not', label: 'Does Not Equal' },
		{ value: 'isNull', label: 'Is Empty' },
		{ value: 'isNotNull', label: 'Is Not Empty' },
	]

	switch (type) {
		case 'string':
			return [
				...baseOperators,
				{ value: 'contains', label: 'Contains' },
				{ value: 'startsWith', label: 'Starts With' },
				{ value: 'endsWith', label: 'Ends With' },
			]
		case 'number':
			return [
				...baseOperators,
				{ value: 'gt', label: 'Greater Than' },
				{ value: 'gte', label: 'Greater or Equal' },
				{ value: 'lt', label: 'Less Than' },
				{ value: 'lte', label: 'Less or Equal' },
			]
		case 'date':
			return [
				...baseOperators,
				{ value: 'gt', label: 'After' },
				{ value: 'gte', label: 'On or After' },
				{ value: 'lt', label: 'Before' },
				{ value: 'lte', label: 'On or Before' },
			]
		case 'enum':
			return [
				{ value: 'equals', label: 'Equals' },
				{ value: 'not', label: 'Does Not Equal' },
				{ value: 'in', label: 'Is One Of' },
				{ value: 'notIn', label: 'Is Not One Of' },
			]
		case 'boolean':
			return [
				{ value: 'equals', label: 'Equals' },
				{ value: 'not', label: 'Does Not Equal' },
			]
		default:
			return baseOperators
	}
}

// Get data source info
export function getDataSourceInfo(
	name: DataSourceType,
): DataSourceInfo | undefined {
	return DATA_SOURCES.find((ds) => ds.name === name)
}
