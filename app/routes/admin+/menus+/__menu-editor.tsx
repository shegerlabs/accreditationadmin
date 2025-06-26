import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Menu, Role } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData } from '@remix-run/react'
import { useMediaQuery } from 'react-responsive'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxGroupField } from '~/components/conform/CheckboxGroupField'
import { InputField } from '~/components/conform/InputField'
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { xssTransform } from '~/utils/validations'
import { type action } from './__menu-editor.server'

export const MenuEditorSchema = z.object({
	id: z.string().optional(),
	name: z
		.string({ required_error: 'Name is required' })
		.transform(xssTransform)
		.pipe(z.string()),
	title: z
		.string({ required_error: 'Title is required' })
		.transform(xssTransform)
		.pipe(z.string()),
	roles: z.array(z.string()).transform(val => val.map(xssTransform)),
})

export function MenuEditor({
	menu,
	roles,
	title,
	intent,
}: {
	menu?: SerializeFrom<
		Pick<Menu, 'id' | 'name' | 'title'> & {
			roles?: Array<Pick<Role, 'id' | 'name'>>
		}
	>
	roles: Array<Pick<Role, 'id' | 'name'>>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const isMobile = useMediaQuery({ maxWidth: 767 })
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema = MenuEditorSchema
	const [form, fields] = useForm({
		id: 'register-menu',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...menu,
			roles: menu?.roles?.map(role => role.id) ?? [],
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this menu? This action cannot be undone.'
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
					to: '/admin/menus',
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />
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
				<Label htmlFor={fields.title.id}>Title</Label>
				<InputField
					meta={fields.title}
					type="text"
					autoComplete="off"
					disabled={disabled}
				/>
				{fields.title.errors && <FieldError>{fields.title.errors}</FieldError>}
			</Field>
			<Field>
				<fieldset>
					<legend className="mb-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
						Roles
					</legend>
					<CheckboxGroupField
						meta={fields.roles}
						items={roles.map(role => ({
							name: role.name,
							value: role.id,
						}))}
					/>
				</fieldset>
				{fields.roles.errors && <FieldError>{fields.roles.errors}</FieldError>}
			</Field>
		</FormCard>
	)
}
