import { getFormProps, useForm } from '@conform-to/react'
import { useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { BadgeTemplate } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { Form, useActionData, useNavigate, useNavigation } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxField } from '~/components/conform/CheckboxField'
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { StatusButton } from '~/components/ui/status-button'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '~/components/ui/tooltip'
import { useIsPending } from '~/utils/misc'

// Badge size presets for reference (dimensions in points, 1pt = 1/72 inch)
// Based on industry standard card sizes
const SIZE_PRESETS = [
	{
		label: 'CR79 Portrait',
		width: 148,
		height: 238,
		widthInches: '2.05"',
		heightInches: '3.30"',
		usage: 'Slightly smaller than CR80. Used for adhesive-back cards, insurance cards, and slim wallet badges.',
	},
	{
		label: 'CR80 Portrait',
		width: 153,
		height: 243,
		widthInches: '2.13"',
		heightInches: '3.37"',
		usage: 'Standard credit card size (ISO ID-1). Best for employee IDs, access cards, membership cards, and wallet-friendly badges.',
	},
	{
		label: 'CR100 Portrait',
		width: 189,
		height: 279,
		widthInches: '2.63"',
		heightInches: '3.88"',
		usage: 'Large event badge. Perfect for trade shows, conferences, and events where visibility from a distance matters.',
	},
	{
		label: 'CR120 Portrait',
		width: 240,
		height: 351,
		widthInches: '3.34"',
		heightInches: '4.88"',
		usage: 'Extra-large badge. Ideal for VIP passes, backstage credentials, and high-visibility event identification.',
	},
] as const

export const BadgeTemplateEditorSchema = z.object({
	id: z.string().optional(),
	tenantId: z.string(),
	name: z.string().min(1, 'Name is required'),
	description: z.string().optional(),
	width: z.coerce.number().min(50, 'Width must be at least 50').default(153),
	height: z.coerce.number().min(50, 'Height must be at least 50').default(244),
	borderWidth: z.coerce.number().min(0).default(0),
	borderColor: z.string().default('#000000'),
	borderRadius: z.coerce.number().min(0).default(0),
	badgeIdPrefix: z.string().min(1, 'Badge ID prefix is required').default('BADGE'),
	isDefault: z.boolean().default(false),
})

export const BadgeTemplateDeleteSchema = z.object({
	id: z.string(),
})

export function BadgeTemplateEditor({
	template,
	tenantId,
	title,
	description,
	intent,
	cancelUrl,
}: {
	template?: SerializeFrom<
		Pick<BadgeTemplate, 'id' | 'name' | 'description' | 'tenantId' | 'width' | 'height' | 'borderWidth' | 'borderColor' | 'borderRadius' | 'badgeIdPrefix' | 'isDefault'>
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
	const navigate = useNavigate()
	const isSubmitting = navigation.state === 'submitting'

	// Find initial preset based on template dimensions
	const initialPreset = template
		? SIZE_PRESETS.find(
				p => p.width === template.width && p.height === template.height,
			)?.label ?? null
		: null
	const [selectedPreset, setSelectedPreset] = useState<string | null>(initialPreset)

	const [form, fields] = useForm({
		id: 'badge-template-editor',
		constraint: getZodConstraint(BadgeTemplateEditorSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: BadgeTemplateEditorSchema })
		},
		defaultValue: {
			...template,
			tenantId,
			width: template?.width ?? 153,
			height: template?.height ?? 243,
			borderWidth: template?.borderWidth ?? 0,
			borderColor: template?.borderColor ?? '#000000',
			borderRadius: template?.borderRadius ?? 0,
			badgeIdPrefix: template?.badgeIdPrefix ?? 'BADGE',
			isDefault: template?.isDefault ?? false,
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<Dialog open onOpenChange={() => navigate(cancelUrl)}>
			<DialogContent
				className="sm:max-w-[500px]"
				onPointerDownOutside={(e) => e.preventDefault()}
				onInteractOutside={(e) => e.preventDefault()}
			>
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
						{/* Size Preset Dropdown */}
						<Field>
							<Label>Size Preset</Label>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline" className="w-full justify-between">
										<span>
											{selectedPreset
												? SIZE_PRESETS.find(p => p.label === selectedPreset)
														? `${selectedPreset} (${SIZE_PRESETS.find(p => p.label === selectedPreset)?.widthInches}×${SIZE_PRESETS.find(p => p.label === selectedPreset)?.heightInches})`
														: selectedPreset
												: 'Select a preset size...'}
										</span>
										<ChevronDown className="h-4 w-4 text-muted-foreground" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
									<TooltipProvider delayDuration={200}>
										{SIZE_PRESETS.map((preset) => (
											<Tooltip key={preset.label}>
												<TooltipTrigger asChild>
													<DropdownMenuItem
														onClick={() => {
															setSelectedPreset(preset.label)
															const widthInput = document.getElementById(fields.width.id) as HTMLInputElement
															const heightInput = document.getElementById(fields.height.id) as HTMLInputElement
															if (widthInput) {
																widthInput.value = String(preset.width)
																widthInput.dispatchEvent(new Event('input', { bubbles: true }))
															}
															if (heightInput) {
																heightInput.value = String(preset.height)
																heightInput.dispatchEvent(new Event('input', { bubbles: true }))
															}
														}}
														className="flex justify-between"
													>
														<span>{preset.label}</span>
														<span className="font-mono text-muted-foreground">
															{preset.widthInches}×{preset.heightInches}
															<span className="ml-1 text-[10px]">
																({preset.width}×{preset.height}pt)
															</span>
														</span>
													</DropdownMenuItem>
												</TooltipTrigger>
												<TooltipContent side="right" className="max-w-[250px]">
													<p className="text-xs">{preset.usage}</p>
												</TooltipContent>
											</Tooltip>
										))}
									</TooltipProvider>
								</DropdownMenuContent>
							</DropdownMenu>
						</Field>
						<Field>
							<Label htmlFor={fields.name.id}>Name</Label>
							<InputField
								meta={fields.name}
								type="text"
								autoFocus
								placeholder="e.g., Standard Badge"
							/>
							{fields.name.errors && (
								<FieldError>{fields.name.errors}</FieldError>
							)}
						</Field>
						<Field>
							<Label htmlFor={fields.description.id}>Description</Label>
							<TextareaField
								meta={fields.description}
								placeholder="Optional description of this badge template"
							/>
							{fields.description.errors && (
								<FieldError>{fields.description.errors}</FieldError>
							)}
						</Field>
						<div className="grid gap-4 md:grid-cols-2">
							<Field>
								<Label htmlFor={fields.width.id}>Width (points)</Label>
								<InputField
									meta={fields.width}
									type="number"
									placeholder="153"
								/>
								{fields.width.errors && (
									<FieldError>{fields.width.errors}</FieldError>
								)}
							</Field>
							<Field>
								<Label htmlFor={fields.height.id}>Height (points)</Label>
								<InputField
									meta={fields.height}
									type="number"
									placeholder="244"
								/>
								{fields.height.errors && (
									<FieldError>{fields.height.errors}</FieldError>
								)}
							</Field>
						</div>
						<div className="grid gap-4 md:grid-cols-3">
							<Field>
								<Label htmlFor={fields.borderWidth.id}>Border Width</Label>
								<InputField
									meta={fields.borderWidth}
									type="number"
									placeholder="0"
								/>
								{fields.borderWidth.errors && (
									<FieldError>{fields.borderWidth.errors}</FieldError>
								)}
							</Field>
							<Field>
								<Label htmlFor={fields.borderColor.id}>Border Color</Label>
								<InputField
									meta={fields.borderColor}
									type="color"
									className="h-9 p-1"
								/>
								{fields.borderColor.errors && (
									<FieldError>{fields.borderColor.errors}</FieldError>
								)}
							</Field>
							<Field>
								<Label htmlFor={fields.borderRadius.id}>Border Radius</Label>
								<InputField
									meta={fields.borderRadius}
									type="number"
									placeholder="0"
								/>
								{fields.borderRadius.errors && (
									<FieldError>{fields.borderRadius.errors}</FieldError>
								)}
							</Field>
						</div>
						<Field>
							<Label htmlFor={fields.badgeIdPrefix.id}>Badge ID Prefix</Label>
							<InputField
								meta={fields.badgeIdPrefix}
								type="text"
								placeholder="e.g., AU2025"
							/>
							<p className="text-xs text-muted-foreground">Prefix for generated badge IDs (e.g., AU2025-001)</p>
							{fields.badgeIdPrefix.errors && (
								<FieldError>{fields.badgeIdPrefix.errors}</FieldError>
							)}
						</Field>
						<div className="flex items-center gap-2">
							<CheckboxField meta={fields.isDefault} />
							<Label htmlFor={fields.isDefault.id} className="cursor-pointer">
								Set as default template for new participant types
							</Label>
						</div>
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

export function BadgeTemplateDeleteDialog({
	template,
	cancelUrl,
}: {
	template: SerializeFrom<Pick<BadgeTemplate, 'id' | 'name'>>
	cancelUrl: string
}) {
	const actionData = useActionData<{ result: any }>()
	const isPending = useIsPending()
	const navigate = useNavigate()

	const [form] = useForm({
		id: 'badge-template-delete',
		lastResult: actionData?.result,
	})

	return (
		<Dialog open onOpenChange={() => navigate(cancelUrl)}>
			<DialogContent
				className="sm:max-w-[425px]"
				onPointerDownOutside={(e) => e.preventDefault()}
				onInteractOutside={(e) => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Delete Badge Template</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete the badge template "{template.name}"?
						Participant types using this template will need to be reassigned.
						This action cannot be undone.
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
