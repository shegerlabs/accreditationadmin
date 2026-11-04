import { Action } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { Form, Link, useNavigation } from '@remix-run/react'
import { useId } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { StepData, WorkflowData } from './types'

const STEP_ACTIONS: Action[] = [
	'APPROVE',
	'REJECT',
	'NOTIFY',
	'PRINT',
	'ARCHIVE',
	'CANCEL',
	'BYPASS',
]

interface StepFormProps {
	step?: Partial<StepData>
	workflow: SerializeFrom<WorkflowData>
	roles: Array<{ id: string; name: string }>
	steps: Array<{ id: string; name: string; action?: Action }>
	defaultAction?: Action
	intent: 'add' | 'edit'
	actionUrl: string
	cancelUrl: string
	redirectUrl?: string
}

export function StepForm({
	step,
	workflow,
	roles,
	steps,
	defaultAction = 'APPROVE',
	intent,
	actionUrl,
	cancelUrl,
	redirectUrl,
}: StepFormProps) {
	const navigation = useNavigation()
	const formId = useId()
	const isSubmitting = navigation.state === 'submitting'

	// Filter out current step and REJECT/BYPASS steps from nextStep options
	const availableNextSteps = steps.filter(
		s => s.id !== step?.id && s.action !== 'REJECT' && s.action !== 'BYPASS'
	)

	return (
		<Form
			method="POST"
			action={actionUrl}
			id={formId}
			className="space-y-4"
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<input type="hidden" name="id" defaultValue={step?.id ?? ''} />
			<input type="hidden" name="tenantId" defaultValue={workflow.tenantId} />
			<input type="hidden" name="workflowId" defaultValue={workflow.id} />
			{redirectUrl && <input type="hidden" name="redirectUrl" defaultValue={redirectUrl} />}

			<div className="space-y-2">
				<Label htmlFor={`${formId}-name`}>Step Name</Label>
				<Input
					id={`${formId}-name`}
					name="name"
					type="text"
					autoComplete="off"
					placeholder="e.g., First Approval"
					defaultValue={step?.name ?? ''}
					required
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor={`${formId}-roleId`}>Assigned Role</Label>
				<Select
					name="roleId"
					defaultValue={step?.roleId ?? ''}
					required
				>
					<SelectTrigger id={`${formId}-roleId`}>
						<SelectValue placeholder="Select Role" />
					</SelectTrigger>
					<SelectContent>
						{roles.map(role => (
							<SelectItem key={role.id} value={role.id}>
								{role.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-2">
				<Label htmlFor={`${formId}-action`}>Action Type</Label>
				<Select
					name="action"
					defaultValue={step?.action ?? defaultAction}
					required
				>
					<SelectTrigger id={`${formId}-action`}>
						<SelectValue placeholder="Select Action" />
					</SelectTrigger>
					<SelectContent>
						{STEP_ACTIONS.map(action => (
							<SelectItem key={action} value={action}>
								{action}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-2">
				<Label htmlFor={`${formId}-order`}>Order</Label>
				<Input
					id={`${formId}-order`}
					name="order"
					type="number"
					min={1}
					autoComplete="off"
					defaultValue={step?.order ?? steps.length + 1}
					required
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor={`${formId}-slaDurationMinutes`}>SLA Duration (minutes)</Label>
				<Input
					id={`${formId}-slaDurationMinutes`}
					name="slaDurationMinutes"
					type="number"
					min={0}
					autoComplete="off"
					placeholder="No SLA"
					defaultValue={step?.slaDurationMinutes ?? ''}
				/>
				<p className="text-xs text-muted-foreground">
					Optional time limit for this step
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor={`${formId}-nextStepId`}>Next Step</Label>
				<Select
					name="nextStepId"
					defaultValue={step?.nextStepId ?? '__none__'}
				>
					<SelectTrigger id={`${formId}-nextStepId`}>
						<SelectValue placeholder="Select Next Step" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__none__">None (Final Step)</SelectItem>
						{availableNextSteps.map(s => (
							<SelectItem key={s.id} value={s.id}>
								{s.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex items-center justify-between gap-4 rounded-lg border p-3">
				<div className="space-y-0.5">
					<Label htmlFor={`${formId}-isRejectionTarget`}>Rejection Target</Label>
					<p className="text-xs text-muted-foreground">
						Rejected participants return here
					</p>
				</div>
				<Switch
					id={`${formId}-isRejectionTarget`}
					name="isRejectionTarget"
					defaultChecked={step?.isRejectionTarget ?? false}
				/>
			</div>

			<div className="flex items-center justify-between gap-4 rounded-lg border p-3">
				<div className="space-y-0.5">
					<Label htmlFor={`${formId}-isBypassTarget`}>Bypass Target</Label>
					<p className="text-xs text-muted-foreground">
						Bypassed participants jump here
					</p>
				</div>
				<Switch
					id={`${formId}-isBypassTarget`}
					name="isBypassTarget"
					defaultChecked={step?.isBypassTarget ?? false}
				/>
			</div>

			<div className="flex items-center justify-between gap-4 rounded-lg border p-3">
				<div className="space-y-0.5">
					<Label htmlFor={`${formId}-requiresAssignment`}>Requires Assignment</Label>
					<p className="text-xs text-muted-foreground">
						Users must be assigned to handle this step
					</p>
				</div>
				<Switch
					id={`${formId}-requiresAssignment`}
					name="requiresAssignment"
					defaultChecked={step?.requiresAssignment ?? true}
				/>
			</div>

			<div className="flex gap-2 pt-4">
				<Button
					type="submit"
					name="intent"
					value={intent}
					disabled={isSubmitting}
					className="flex-1"
				>
					{isSubmitting ? 'Saving...' : intent === 'edit' ? 'Update' : 'Create'}
				</Button>
				{intent === 'edit' && (
					<Button
						type="submit"
						name="intent"
						value="delete"
						variant="destructive"
						disabled={isSubmitting}
						className="flex-1"
					>
						Delete
					</Button>
				)}
				<Button type="button" variant="outline" asChild className="flex-1">
					<Link to={cancelUrl}>Cancel</Link>
				</Button>
			</div>
		</Form>
	)
}
