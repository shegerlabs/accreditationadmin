import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Title } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { Form, useActionData, useNavigate } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Label } from '~/components/ui/label'
import { useIsPending } from '~/utils/misc'
import { xssTransform } from '~/utils/validations'
import { type action } from './__title-editor.server'

export const TitleEditorSchema = z.object({
	id: z.string().optional(),
	name: z
		.string({ required_error: 'Name is required' })
		.min(1, 'Name is required')
		.max(50, 'Name must be at most 50 characters')
		.transform(xssTransform),
})

export const TitleDeleteSchema = z.object({
	id: z.string(),
})

export function TitleEditor({
	title,
	dialogTitle,
	intent,
}: {
	title?: SerializeFrom<Pick<Title, 'id' | 'name'>>
	dialogTitle: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const actionData = useActionData<typeof action>()
	const navigate = useNavigate()
	const isPending = useIsPending()

	const isDelete = intent === 'delete'
	const schema = isDelete ? TitleDeleteSchema : TitleEditorSchema

	const [form, fields] = useForm({
		id: 'title-form',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: title,
	})

	const handleClose = () => navigate('/admin/titles')

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent
				className="max-h-[90vh] overflow-y-auto sm:max-w-[425px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{dialogTitle}</DialogTitle>
					<DialogDescription>
						{isDelete
							? 'Are you sure you want to delete this title? This action cannot be undone.'
							: intent === 'edit'
								? 'Update the title details below.'
								: 'Fill in the details to add a new title.'}
					</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<InputField meta={fields.id} type="hidden" />
					<input type="hidden" name="intent" value={intent} />

					{!isDelete && (
						<div className="grid gap-4 py-4">
							<Field>
								<Label htmlFor={fields.name.id}>Name</Label>
								<InputField
									meta={fields.name}
									type="text"
									autoComplete="off"
									placeholder="e.g., Mr., Mrs., Dr."
								/>
								{fields.name.errors && (
									<FieldError>{fields.name.errors}</FieldError>
								)}
							</Field>
						</div>
					)}

					{isDelete && title && (
						<div className="space-y-4 py-4">
							<div className="text-sm">
								<span className="text-muted-foreground">Name:</span>{' '}
								<span className="font-medium">{title.name}</span>
							</div>
						</div>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={handleClose}>
							Cancel
						</Button>
						<Button
							type="submit"
							variant={isDelete ? 'destructive' : 'default'}
							disabled={isPending}
						>
							{isPending
								? isDelete
									? 'Deleting...'
									: 'Saving...'
								: isDelete
									? 'Delete'
									: 'Save'}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
