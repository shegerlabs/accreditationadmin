import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { MenuItem, Role } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData, useParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxGroupField } from '~/components/conform/CheckboxGroupField'
import { InputField } from '~/components/conform/InputField'
import { FormCard } from '~/components/form-card'
import { Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { xssTransform } from '~/utils/validations'
import { action } from './__menu-item-editor.server'

export const MenuItemEditorSchema = z.object({
	id: z.string().optional(),
	menuId: z
		.string({ required_error: 'Menu is required' })
		.transform(xssTransform)
		.pipe(z.string()),
	name: z
		.string({ required_error: 'Name is required' })
		.transform(xssTransform)
		.pipe(z.string()),
	title: z
		.string({ required_error: 'Title is required' })
		.transform(xssTransform)
		.pipe(z.string()),
	link: z
		.string({ required_error: 'Link is required' })
		.transform(xssTransform)
		.pipe(z.string()),
	icon: z.string().optional().transform(xssTransform).pipe(z.string()),
	roles: z.array(z.string()).transform(val => val.map(xssTransform)),
})

export const MenuItemDeleteSchema = z.object({
	id: z.string(),
})

export function MenuItemEditor({
	menuItem,
	roles,
	title,
	intent,
}: {
	menuItem?: SerializeFrom<
		Pick<MenuItem, 'id' | 'name' | 'title' | 'link' | 'icon' | 'menuId'> & {
			roles?: Array<Pick<Role, 'id' | 'name'>>
		}
	>
	roles: Array<Pick<Role, 'id' | 'name'>>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const params = useParams()
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema =
		intent === 'delete' ? MenuItemDeleteSchema : MenuItemEditorSchema
	const [form, fields] = useForm({
		id: 'register-menu-item',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...menuItem,
			menuId: params.menuId,
			roles: menuItem?.roles?.map(role => role.id) ?? [],
		},
	})

	return (
		<FormCard
			title={title}
			description={
				intent === 'delete'
					? 'Are you sure you want to delete this menu item? This action cannot be undone.'
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
					to: `/admin/menus/${params.menuId}/items`,
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />
			<InputField meta={fields.menuId} type="hidden" />

			<div className="space-y-4">
				<Field>
					<Label htmlFor={fields.name.id}>Name</Label>
					<InputField
						meta={fields.name}
						type="text"
						autoComplete="off"
						disabled={disabled}
						className="w-full"
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
						className="w-full"
					/>
					{fields.title.errors && (
						<FieldError>{fields.title.errors}</FieldError>
					)}
				</Field>
			</div>

			<div className="space-y-4">
				<Field>
					<Label htmlFor={fields.link.id}>Link</Label>
					<InputField
						meta={fields.link}
						type="text"
						autoComplete="off"
						disabled={disabled}
						className="w-full"
					/>
					{fields.link.errors && <FieldError>{fields.link.errors}</FieldError>}
				</Field>

				<Field>
					<Label htmlFor={fields.icon.id}>Icon</Label>
					<InputField
						meta={fields.icon}
						type="text"
						autoComplete="off"
						disabled={disabled}
						className="w-full"
					/>
					{fields.icon.errors && <FieldError>{fields.icon.errors}</FieldError>}
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
					{fields.roles.errors && (
						<FieldError>{fields.roles.errors}</FieldError>
					)}
				</Field>
			</div>
		</FormCard>
	)
}
