import { Action } from '@prisma/client'

export interface StepData extends Record<string, unknown> {
	id: string
	name: string
	action: Action
	order: number
	roleId: string
	roleName: string
	nextStepId: string | null
	workflowId: string
	tenantId: string
	isRejectionTarget: boolean
	isBypassTarget: boolean
	requiresAssignment: boolean
	slaDurationMinutes: number | null
	nodeWidth?: number // Calculated width for uniform node sizing
	baseUrl?: string // Base URL for edit navigation
}

// Works for both Workflow and WorkflowTemplate
export interface WorkflowData {
	id: string
	name: string
	tenantId: string
	eventId?: string // Optional - only present for Workflow, not WorkflowTemplate
	description?: string | null // Optional - only present for WorkflowTemplate
}
