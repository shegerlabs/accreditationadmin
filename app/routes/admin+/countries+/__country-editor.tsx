import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Country } from '@prisma/client'
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
import { type action } from './__country-editor.server'

export const CountryEditorSchema = z.object({
	id: z.string().optional(),
	name: z
		.string({ required_error: 'Name is required' })
		.min(1, 'Name is required')
		.transform(xssTransform),
	code: z
		.string({ required_error: 'Code is required' })
		.min(2, 'Code must be at least 2 characters')
		.max(3, 'Code must be at most 3 characters')
		.transform(xssTransform),
})

export const CountryDeleteSchema = z.object({
	id: z.string(),
})

export function CountryEditor({
	country,
	title,
	intent,
}: {
	country?: SerializeFrom<Pick<Country, 'id' | 'name' | 'code'>>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const actionData = useActionData<typeof action>()
	const navigate = useNavigate()
	const isPending = useIsPending()

	const isDelete = intent === 'delete'
	const schema = isDelete ? CountryDeleteSchema : CountryEditorSchema

	const [form, fields] = useForm({
		id: 'country-form',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: country,
	})

	const handleClose = () => navigate('/admin/countries')

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent
				className="max-h-[90vh] overflow-y-auto sm:max-w-[425px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{isDelete
							? 'Are you sure you want to delete this country? This action cannot be undone.'
							: intent === 'edit'
								? 'Update the country details below.'
								: 'Fill in the details to add a new country.'}
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
								/>
								{fields.name.errors && (
									<FieldError>{fields.name.errors}</FieldError>
								)}
							</Field>

							<Field>
								<Label htmlFor={fields.code.id}>Code</Label>
								<InputField
									meta={fields.code}
									type="text"
									autoComplete="off"
									maxLength={3}
								/>
								<p className="text-xs text-muted-foreground">
									2 or 3 letter country code (e.g., US, USA)
								</p>
								{fields.code.errors && (
									<FieldError>{fields.code.errors}</FieldError>
								)}
							</Field>
						</div>
					)}

					{isDelete && country && (
						<div className="space-y-4 py-4">
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
								<div>
									<span className="text-muted-foreground">Name:</span>{' '}
									<span className="font-medium">{country.name}</span>
								</div>
								<div>
									<span className="text-muted-foreground">Code:</span>{' '}
									<span className="font-medium">{country.code}</span>
								</div>
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
