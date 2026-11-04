import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { WorkflowTemplate } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { Form, useActionData, useNavigation } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { TextareaField } from '~/components/conform/TextareaField'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { StatusButton } from '~/components/ui/status-button'
import { useIsPending } from '~/utils/misc'

export const TemplateEditorSchema = z.object({
	id: z.string().optional(),
	tenantId: z.string(),
	name: z.string().min(1, 'Name is required'),
	description: z.string().optional(),
})

export const TemplateDeleteSchema = z.object({
	id: z.string(),
})

export function TemplateEditor({
	template,
	tenantId,
	title,
	description,
	intent,
	cancelUrl,
}: {
	template?: SerializeFrom<
		Pick<WorkflowTemplate, 'id' | 'name' | 'description' | 'tenantId'>
	>
	tenantId: string
	title: string
	description: string
	intent: 'add' | 'edit'
	cancelUrl: string
}) {
	const actionData = useActionData<{ result: any }>()
	const isPending = useIsPending()
	const navigation = useNavigation()
	const isSubmitting = navigation.state === 'submitting'

	const [form, fields] = useForm({
		id: 'template-editor',
		constraint: getZodConstraint(TemplateEditorSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: TemplateEditorSchema })
		},
		defaultValue: {
			...template,
			tenantId,
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<Dialog open>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<input type="hidden" name="id" value={template?.id ?? ''} />
					<input type="hidden" name="tenantId" value={tenantId} />

					<div className="grid gap-4 py-4">
						<Field>
							<Label htmlFor={fields.name.id}>Name</Label>
							<InputField
								meta={fields.name}
								type="text"
								autoFocus
								placeholder="e.g., Standard Approval Flow"
							/>
							{fields.name.errors && (
								<FieldError>{fields.name.errors}</FieldError>
							)}
						</Field>
						<Field>
							<Label htmlFor={fields.description.id}>Description</Label>
							<TextareaField
								meta={fields.description}
								placeholder="Optional description of this workflow template"
							/>
							{fields.description.errors && (
								<FieldError>{fields.description.errors}</FieldError>
							)}
						</Field>
					</div>

					<ErrorList id={form.errorId} errors={form.errors} />

					<DialogFooter>
						<DialogClose asChild>
							<Button type="button" variant="outline" asChild>
								<a href={cancelUrl}>Cancel</a>
							</Button>
						</DialogClose>
						<StatusButton
							type="submit"
							name="intent"
							value={intent}
							disabled={isPending || isSubmitting}
							status={isPending ? 'pending' : form.status ?? 'idle'}
						>
							{intent === 'add' ? 'Create Template' : 'Save Changes'}
						</StatusButton>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}

export function TemplateDeleteDialog({
	template,
	cancelUrl,
}: {
	template: SerializeFrom<Pick<WorkflowTemplate, 'id' | 'name'>>
	cancelUrl: string
}) {
	const actionData = useActionData<{ result: any }>()
	const isPending = useIsPending()

	const [form] = useForm({
		id: 'template-delete',
		lastResult: actionData?.result,
	})

	return (
		<Dialog open>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Delete Template</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete the template "{template.name}"? This
						will also delete all step templates associated with it. This action
						cannot be undone.
					</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<input type="hidden" name="id" value={template.id} />

					<ErrorList id={form.errorId} errors={form.errors} />

					<DialogFooter>
						<DialogClose asChild>
							<Button type="button" variant="outline" asChild>
								<a href={cancelUrl}>Cancel</a>
							</Button>
						</DialogClose>
						<StatusButton
							type="submit"
							name="intent"
							value="delete"
							variant="destructive"
							disabled={isPending}
							status={isPending ? 'pending' : form.status ?? 'idle'}
						>
							Delete Template
						</StatusButton>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
