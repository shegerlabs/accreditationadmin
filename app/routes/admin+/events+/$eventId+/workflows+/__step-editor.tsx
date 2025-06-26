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
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { xssTransform } from '~/utils/validations'
import { type action } from './__step-editor.server'

export const StepEditorSchema = z.object({
	id: z.string().optional(),
	name: z
		.string({ required_error: 'Name is required' })
		.transform(xssTransform),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	workflowId: z.string({ required_error: 'Workflow is required' }),
	roleId: z.string({ required_error: 'Role is required' }),
	action: z.enum(['APPROVE', 'REJECT', 'NOTIFY', 'PRINT', 'CANCEL']),
})

export const StepDeleteSchema = z.object({
	id: z.string(),
})

export function StepEditor({
	step,
	workflow,
	title,
	intent,
}: {
	step?: SerializeFrom<
		Pick<Step, 'id' | 'name' | 'tenantId' | 'workflowId' | 'roleId' | 'action'>
	>
	workflow: SerializeFrom<Pick<Workflow, 'id' | 'tenantId' | 'eventId'>>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const { roles } = useOutletContext<{
		roles: Role[]
	}>()
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema = intent === 'delete' ? StepDeleteSchema : StepEditorSchema
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
					items={['APPROVE', 'REJECT', 'NOTIFY', 'PRINT', 'CANCEL'].map(
						action => ({
							name: action,
							value: action,
						}),
					)}
					disabled={disabled}
					placeholder="Select Action"
				/>
				{fields.action.errors && (
					<FieldError>{fields.action.errors}</FieldError>
				)}
			</Field>
		</FormCard>
	)
}
