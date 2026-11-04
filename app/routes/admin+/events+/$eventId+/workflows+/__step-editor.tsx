import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Role, Step, Workflow } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData, useOutletContext } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { SwitchField } from '~/components/conform/SwitchField'
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { xssTransform } from '~/utils/validations'
import { type action } from './__step-editor.server'

const STEP_ACTIONS = ['APPROVE', 'REJECT', 'NOTIFY', 'PRINT', 'ARCHIVE', 'CANCEL', 'BYPASS'] as const

export const StepEditorSchema = z.object({
	id: z.string().optional(),
	name: z
		.string({ required_error: 'Name is required' })
		.transform(xssTransform),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	workflowId: z.string({ required_error: 'Workflow is required' }),
	roleId: z.string({ required_error: 'Role is required' }),
	action: z.enum(STEP_ACTIONS),
	order: z.coerce.number().int().min(0, 'Order must be 0 or greater').default(0),
	nextStepId: z.string().optional().nullable(),
	isRejectionTarget: z.string().optional().transform(val => val === 'on'),
	isBypassTarget: z.string().optional().transform(val => val === 'on'),
	requiresAssignment: z.string().optional().transform(val => val === 'on'),
	slaDurationMinutes: z
		.string()
		.optional()
		.transform(val => (val === '' || val === undefined ? null : parseInt(val, 10)))
		.pipe(z.number().int().min(0).nullable()),
})

export const StepDeleteSchema = z.object({
	id: z.string(),
})

export function StepEditor({
	step,
	workflow,
	title,
	intent,
	steps = [],
}: {
	step?: SerializeFrom<
		Pick<Step, 'id' | 'name' | 'tenantId' | 'workflowId' | 'roleId' | 'action' | 'order' | 'nextStepId' | 'isRejectionTarget' | 'isBypassTarget' | 'requiresAssignment' | 'slaDurationMinutes'>
	>
	workflow: SerializeFrom<Pick<Workflow, 'id' | 'tenantId' | 'eventId'>>
	title: string
	intent?: 'add' | 'edit' | 'delete'
	steps?: SerializeFrom<Pick<Step, 'id' | 'name'>>[]
}) {
	const { roles } = useOutletContext<{
		roles: Role[]
	}>()
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema = intent === 'delete' ? StepDeleteSchema : StepEditorSchema
	// Filter out current step from nextStep options
	const availableNextSteps = steps.filter(s => s.id !== step?.id)

	const [form, fields] = useForm({
		id: 'register-step',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...step,
			workflowId: workflow.id,
			tenantId: workflow.tenantId,
			roleId: step?.roleId,
			order: step?.order ?? 0,
			nextStepId: step?.nextStepId ?? '__none__',
			isRejectionTarget: step?.isRejectionTarget ? 'on' : '',
			isBypassTarget: step?.isBypassTarget ? 'on' : '',
			requiresAssignment: step?.requiresAssignment !== false ? 'on' : '',
			slaDurationMinutes: step?.slaDurationMinutes?.toString() ?? '',
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this step? This action cannot be undone.'
					: undefined
			}
			formId={form.id}
			onSubmit={form.onSubmit}
			buttons={[
				{
					label: intent === 'delete' ? 'Delete' : 'Save',
					intent: intent,
					variant: intent === 'delete' ? 'destructive' : 'default',
					type: 'submit',
				},
				{
					label: 'Cancel',
					to: `/admin/events/${workflow.eventId}/workflows/${workflow.id}/steps`,
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />
			<InputField meta={fields.tenantId} type="hidden" />
			<InputField meta={fields.workflowId} type="hidden" />

			<Field>
				<Label htmlFor={fields.name.id}>Name</Label>
				<InputField
					meta={fields.name}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.name.errors && <FieldError>{fields.name.errors}</FieldError>}
			</Field>

			<Field>
				<Label htmlFor={fields.roleId.id}>Role</Label>
				<SelectField
					meta={fields.roleId}
					items={roles.map(role => ({
						name: role.name,
						value: role.id,
					}))}
					disabled={disabled}
					placeholder="Select Role"
				/>
				{fields.roleId.errors && (
					<FieldError>{fields.roleId.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.action.id}>Action</Label>
				<SelectField
					meta={fields.action}
					items={STEP_ACTIONS.map(action => ({
						name: action,
						value: action,
					}))}
					disabled={disabled}
					placeholder="Select Action"
				/>
				{fields.action.errors && (
					<FieldError>{fields.action.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.order.id}>Order</Label>
				<InputField
					meta={fields.order}
					type="number"
					min={0}
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.order.errors && <FieldError>{fields.order.errors}</FieldError>}
			</Field>

			<Field>
				<Label htmlFor={fields.slaDurationMinutes.id}>SLA Duration (minutes)</Label>
				<InputField
					meta={fields.slaDurationMinutes}
					type="number"
					min={0}
					autoComplete="off"
					disabled={disabled}
					placeholder="No SLA"
				/>
				<p className="text-sm text-muted-foreground">
					Optional time limit for this step
				</p>
				{fields.slaDurationMinutes.errors && (
					<FieldError>{fields.slaDurationMinutes.errors}</FieldError>
				)}
			</Field>

			<Field>
				<Label htmlFor={fields.nextStepId.id}>Next Step</Label>
				<SelectField
					meta={fields.nextStepId}
					items={[
						{ name: 'None (Final Step)', value: '__none__' },
						...availableNextSteps.map(s => ({
							name: s.name,
							value: s.id,
						})),
					]}
					disabled={disabled}
					placeholder="Select Next Step"
				/>
				{fields.nextStepId.errors && (
					<FieldError>{fields.nextStepId.errors}</FieldError>
				)}
			</Field>

			<div className="flex items-center justify-between gap-4 rounded-lg border p-3">
				<div className="space-y-0.5">
					<Label htmlFor={fields.isRejectionTarget.id}>Rejection Target</Label>
					<p className="text-sm text-muted-foreground">
						Rejected participants return to this step
					</p>
				</div>
				<SwitchField meta={fields.isRejectionTarget} />
			</div>

			<div className="flex items-center justify-between gap-4 rounded-lg border p-3">
				<div className="space-y-0.5">
					<Label htmlFor={fields.isBypassTarget.id}>Bypass Target</Label>
					<p className="text-sm text-muted-foreground">
						Bypassed participants jump to this step
					</p>
				</div>
				<SwitchField meta={fields.isBypassTarget} />
			</div>

			<div className="flex items-center justify-between gap-4 rounded-lg border p-3">
				<div className="space-y-0.5">
					<Label htmlFor={fields.requiresAssignment.id}>Requires Assignment</Label>
					<p className="text-sm text-muted-foreground">
						Users must be assigned to handle this step
					</p>
				</div>
				<SwitchField meta={fields.requiresAssignment} />
			</div>
		</FormCard>
	)
}
