// Types for the Custom Report Builder

export type DataSourceType =
	| 'Participant'
	| 'Invitation'
	| 'AuditLog'
	| 'ParticipantType'
	| 'Country'
	| 'Restriction'

export type FilterOperator =
	| 'equals'
	| 'not'
	| 'contains'
	| 'startsWith'
	| 'endsWith'
	| 'gt'
	| 'lt'
	| 'gte'
	| 'lte'
	| 'in'
	| 'notIn'
	| 'isNull'
	| 'isNotNull'

export type AggregationType = 'count' | 'sum' | 'avg' | 'min' | 'max'

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum'

export interface SelectedField {
	path: string // e.g., 'firstName' or 'participantType.name'
	alias?: string // Display name override
}

// Computed/merged field that combines multiple fields
export interface ComputedField {
	id: string // Unique identifier for the computed field
	name: string // Display name (e.g., "Full Name")
	fields: string[] // Field paths to merge (e.g., ['firstName', 'familyName'])
	separator: string // Separator between values (e.g., ' ', ', ', ' - ')
}

export interface ReportFilter {
	field: string
	operator: FilterOperator
	value: unknown
}

export interface ReportAggregation {
	field: string
	type: AggregationType
	alias?: string
}

export interface ReportSorting {
	field: string
	direction: 'asc' | 'desc'
}

export interface CustomReportConfig {
	dataSource: DataSourceType
	fields: SelectedField[]
	computedFields?: ComputedField[] // Merged/computed fields
	fieldOrder?: string[] // Combined display order
	filters: ReportFilter[]
	groupBy?: string[]
	aggregations?: ReportAggregation[]
	sorting: ReportSorting[]
	limit?: number
}

// Wizard state that's stored in session
export interface WizardState {
	step: number
	dataSource?: DataSourceType
	fields: SelectedField[]
	computedFields: ComputedField[]
	fieldOrder: string[] // Combined order: field paths and 'computed_${id}' for computed fields
	filters: ReportFilter[]
	groupBy: string[]
	aggregations: ReportAggregation[]
	sorting: ReportSorting[]
	limit?: number
	name?: string
	description?: string
	isPublic?: boolean
}

// Default wizard state
export const DEFAULT_WIZARD_STATE: WizardState = {
	step: 1,
	dataSource: undefined,
	fields: [],
	computedFields: [],
	fieldOrder: [],
	filters: [],
	groupBy: [],
	aggregations: [],
	sorting: [],
	limit: 100,
}

// Validation for wizard steps
export function isStep1Complete(state: WizardState): boolean {
	return !!state.dataSource
}

export function isStep2Complete(state: WizardState): boolean {
	return state.fields.length > 0
}

export function isStep3Complete(_state: WizardState): boolean {
	// Filters are optional
	return true
}

export function isStep4Complete(state: WizardState): boolean {
	// Sorting is optional but we need at least one if groupBy is used
	if (state.groupBy.length > 0 && state.aggregations.length === 0) {
		return false
	}
	return true
}

export function isStep5Complete(state: WizardState): boolean {
	return !!state.name && state.name.trim().length > 0
}

export function canProceedToStep(
	state: WizardState,
	targetStep: number,
): boolean {
	switch (targetStep) {
		case 1:
			return true
		case 2:
			return isStep1Complete(state)
		case 3:
			return isStep1Complete(state) && isStep2Complete(state)
		case 4:
			return (
				isStep1Complete(state) &&
				isStep2Complete(state) &&
				isStep3Complete(state)
			)
		case 5:
			return (
				isStep1Complete(state) &&
				isStep2Complete(state) &&
				isStep3Complete(state) &&
				isStep4Complete(state)
			)
		default:
			return false
	}
}

// Result types for running reports
export interface ReportResult {
	columns: { key: string; label: string; type: FieldType }[]
	rows: Record<string, unknown>[]
	totalCount: number
	executionTimeMs: number
}
