import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint } from '@conform-to/zod'
import { SettingType } from '@prisma/client'
import { Form } from '@remix-run/react'
import { Save, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { ErrorList } from '~/components/forms'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { StatusButton } from '~/components/ui/status-button'
import { Switch } from '~/components/ui/switch'

export const UpdateSettingSchema = z.object({
	key: z.string(),
	value: z.string(),
	type: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'JSON']),
})

export function SettingField({
	setting,
	category,
	isSubmitting,
}: {
	setting: {
		key: string
		value?: unknown
		type: SettingType
		label: string
		description: string | null
		isDefault: boolean
	}
	category: string
	isSubmitting: boolean
}) {
	const [form, fields] = useForm({
		id: `setting-${setting.key}`,
		constraint: getZodConstraint(UpdateSettingSchema),
		defaultValue: {
			key: setting.key,
			value: setting.type === 'JSON'
				? JSON.stringify(setting.value, null, 2)
				: String(setting.value),
			type: setting.type,
		},
	})

	const [boolChecked, setBoolChecked] = useState(Boolean(setting.value))

	const renderInput = () => {
		const value = setting.type === 'JSON'
			? JSON.stringify(setting.value, null, 2)
			: String(setting.value)

		switch (setting.type) {
			case 'BOOLEAN':
				return (
					<div className="flex items-center gap-2">
						<input type="hidden" name="value" value={String(boolChecked)} />
						<Switch
							checked={boolChecked}
							onCheckedChange={setBoolChecked}
						/>
						<span className="text-sm text-muted-foreground">
							{boolChecked ? 'Enabled' : 'Disabled'}
						</span>
					</div>
				)

			case 'NUMBER':
				return (
					<Input
						{...getInputProps(fields.value, { type: 'number' })}
						defaultValue={value}
						className="max-w-[200px]"
					/>
				)

			case 'JSON':
				return (
					<textarea
						name={fields.value.name}
						defaultValue={value}
						className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					/>
				)

			default:
				return (
					<Input
						{...getInputProps(fields.value, { type: 'text' })}
						defaultValue={value}
					/>
				)
		}
	}

	return (
		<div className="rounded-lg border p-4">
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1">
					<div className="flex items-center gap-2">
						<Label className="text-base font-medium">{setting.label}</Label>
						{setting.isDefault && (
							<Badge variant="secondary" className="text-xs">
								Default
							</Badge>
						)}
						<Badge variant="outline" className="text-xs">
							{setting.type}
						</Badge>
					</div>
					{setting.description && (
						<p className="mt-1 text-sm text-muted-foreground">
							{setting.description}
						</p>
					)}
				</div>
			</div>

			<Form method="POST" {...getFormProps(form)} className="mt-4">
				<AuthenticityTokenInput />
				<HoneypotInputs />
				<input type="hidden" name="key" value={setting.key} />
				<input type="hidden" name="type" value={setting.type} />
				<input type="hidden" name="category" value={category} />

				<div className="flex items-end gap-3">
					<div className="flex-1">{renderInput()}</div>
					<div className="flex gap-2">
						<StatusButton
							type="submit"
							size="sm"
							status={isSubmitting ? 'pending' : 'idle'}
							disabled={isSubmitting}
						>
							<Save className="mr-1 h-4 w-4" />
							Save
						</StatusButton>
						{!setting.isDefault && (
							<Button
								type="submit"
								name="intent"
								value="reset"
								variant="outline"
								size="sm"
								disabled={isSubmitting}
								title="Reset to default"
							>
								<RotateCcw className="h-4 w-4" />
							</Button>
						)}
					</div>
				</div>

				<ErrorList id={form.errorId} errors={form.errors} />
			</Form>
		</div>
	)
}
