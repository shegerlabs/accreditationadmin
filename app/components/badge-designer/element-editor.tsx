import {
	Image,
	QrCode,
	Type,
	Variable,
	Square,
	Camera,
	Trash2,
	GripVertical,
	ChevronDown,
	ChevronUp,
} from 'lucide-react'
import { useState } from 'react'
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
import { cn } from '~/utils/misc'
import {
	BadgeElement,
	BadgeElementType,
	DYNAMIC_FIELDS,
	createDefaultElement,
} from './types'

const ELEMENT_TYPES: Array<{
	type: BadgeElementType
	label: string
	icon: React.ComponentType<{ className?: string }>
	description: string
}> = [
	{
		type: 'PHOTO',
		label: 'Photo',
		icon: Camera,
		description: 'Participant photo',
	},
	{
		type: 'QR_CODE',
		label: 'QR Code',
		icon: QrCode,
		description: 'Scannable QR code',
	},
	{
		type: 'TEXT',
		label: 'Text',
		icon: Type,
		description: 'Static text label',
	},
	{
		type: 'DYNAMIC_TEXT',
		label: 'Dynamic Text',
		icon: Variable,
		description: 'Participant data field',
	},
	{
		type: 'IMAGE',
		label: 'Image',
		icon: Image,
		description: 'Logo or static image',
	},
	{
		type: 'SHAPE',
		label: 'Shape',
		icon: Square,
		description: 'Rectangle or shape',
	},
]

interface ElementEditorProps {
	elements: BadgeElement[]
	onChange: (elements: BadgeElement[]) => void
	canvasWidth: number
	canvasHeight: number
}

export function ElementEditor({
	elements,
	onChange,
	canvasWidth,
	canvasHeight,
}: ElementEditorProps) {
	const [expandedId, setExpandedId] = useState<string | null>(null)

	const addElement = (type: BadgeElementType) => {
		const id = `element-${Date.now()}`
		const newElement = createDefaultElement(type, id)
		onChange([...elements, newElement])
		setExpandedId(id)
	}

	const updateElement = (id: string, updates: Partial<BadgeElement>) => {
		onChange(
			elements.map(el =>
				el.id === id ? ({ ...el, ...updates } as BadgeElement) : el,
			),
		)
	}

	const removeElement = (id: string) => {
		onChange(elements.filter(el => el.id !== id))
		if (expandedId === id) setExpandedId(null)
	}

	const moveElement = (index: number, direction: 'up' | 'down') => {
		const newIndex = direction === 'up' ? index - 1 : index + 1
		if (newIndex < 0 || newIndex >= elements.length) return
		const newElements = [...elements]
		const [moved] = newElements.splice(index, 1)
		newElements.splice(newIndex, 0, moved)
		onChange(newElements)
	}

	return (
		<div className="flex flex-col gap-4">
			{/* Add Element Buttons */}
			<div className="grid grid-cols-3 gap-2">
				{ELEMENT_TYPES.map(({ type, label, icon: Icon }) => (
					<Button
						key={type}
						type="button"
						variant="outline"
						size="sm"
						onClick={() => addElement(type)}
						className="flex items-center gap-2"
					>
						<Icon className="h-4 w-4" />
						{label}
					</Button>
				))}
			</div>

			{/* Elements List */}
			<div className="flex flex-col gap-2">
				{elements.length === 0 ? (
					<p className="py-4 text-center text-sm text-muted-foreground">
						No elements added yet. Click a button above to add elements.
					</p>
				) : (
					elements.map((element, index) => {
						const typeInfo = ELEMENT_TYPES.find(t => t.type === element.type)
						const Icon = typeInfo?.icon ?? Square
						const isExpanded = expandedId === element.id

						return (
							<div
								key={element.id}
								className={cn(
									'rounded-lg border bg-card',
									isExpanded && 'ring-2 ring-primary',
								)}
							>
								{/* Header */}
								<div
									className="flex cursor-pointer items-center gap-2 p-3"
									onClick={() =>
										setExpandedId(isExpanded ? null : element.id)
									}
								>
									<GripVertical className="h-4 w-4 text-muted-foreground" />
									<Icon className="h-4 w-4" />
									<span className="flex-1 font-medium">
										{typeInfo?.label}
										{element.type === 'TEXT' && (
											<span className="ml-2 text-muted-foreground">
												"{(element as any).content?.slice(0, 20)}..."
											</span>
										)}
										{element.type === 'DYNAMIC_TEXT' && (
											<span className="ml-2 text-muted-foreground">
												[{(element as any).field}]
											</span>
										)}
									</span>
									<span className="rounded bg-muted px-2 py-0.5 text-xs">
										{element.page}
									</span>
									<div className="flex items-center gap-1">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="h-6 w-6"
											onClick={e => {
												e.stopPropagation()
												moveElement(index, 'up')
											}}
											disabled={index === 0}
										>
											<ChevronUp className="h-4 w-4" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="h-6 w-6"
											onClick={e => {
												e.stopPropagation()
												moveElement(index, 'down')
											}}
											disabled={index === elements.length - 1}
										>
											<ChevronDown className="h-4 w-4" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="h-6 w-6 text-destructive"
											onClick={e => {
												e.stopPropagation()
												removeElement(element.id)
											}}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								</div>

								{/* Expanded Editor */}
								{isExpanded && (
									<div className="border-t p-3">
										<ElementForm
											element={element}
											onChange={updates => updateElement(element.id, updates)}
											canvasWidth={canvasWidth}
											canvasHeight={canvasHeight}
										/>
									</div>
								)}
							</div>
						)
					})
				)}
			</div>
		</div>
	)
}

interface ElementFormProps {
	element: BadgeElement
	onChange: (updates: Partial<BadgeElement>) => void
	canvasWidth: number
	canvasHeight: number
}

function ElementForm({
	element,
	onChange,
	canvasWidth,
	canvasHeight,
}: ElementFormProps) {
	return (
		<div className="flex flex-col gap-4">
			{/* Common Properties */}
			<div className="grid grid-cols-2 gap-3">
				<div>
					<Label htmlFor="page">Page</Label>
					<Select
						value={element.page}
						onValueChange={value =>
							onChange({ page: value as 'front' | 'back' })
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="front">Front</SelectItem>
							<SelectItem value="back">Back</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Position */}
			<div>
				<Label className="text-xs text-muted-foreground">Position</Label>
				<div className="grid grid-cols-2 gap-2">
					<div>
						<Label htmlFor="x" className="text-xs">
							X (0-{canvasWidth})
						</Label>
						<Input
							id="x"
							type="number"
							min={0}
							max={canvasWidth}
							value={element.x}
							onChange={e => onChange({ x: Number(e.target.value) })}
						/>
					</div>
					<div>
						<Label htmlFor="y" className="text-xs">
							Y (0-{canvasHeight})
						</Label>
						<Input
							id="y"
							type="number"
							min={0}
							max={canvasHeight}
							value={element.y}
							onChange={e => onChange({ y: Number(e.target.value) })}
						/>
					</div>
				</div>
			</div>

			{/* Size */}
			<div>
				<Label className="text-xs text-muted-foreground">Size</Label>
				<div className="grid grid-cols-2 gap-2">
					<div>
						<Label htmlFor="width" className="text-xs">
							Width
						</Label>
						<Input
							id="width"
							type="number"
							min={1}
							value={element.width}
							onChange={e => onChange({ width: Number(e.target.value) })}
						/>
					</div>
					<div>
						<Label htmlFor="height" className="text-xs">
							Height
						</Label>
						<Input
							id="height"
							type="number"
							min={1}
							value={element.height}
							onChange={e => onChange({ height: Number(e.target.value) })}
						/>
					</div>
				</div>
			</div>

			{/* Type-specific Properties */}
			{element.type === 'TEXT' && (
				<TextElementFields element={element} onChange={onChange} />
			)}
			{element.type === 'DYNAMIC_TEXT' && (
				<DynamicTextElementFields element={element} onChange={onChange} />
			)}
			{element.type === 'QR_CODE' && (
				<QRCodeElementFields element={element} onChange={onChange} />
			)}
			{element.type === 'IMAGE' && (
				<ImageElementFields element={element} onChange={onChange} />
			)}
			{element.type === 'SHAPE' && (
				<ShapeElementFields element={element} onChange={onChange} />
			)}
		</div>
	)
}

function TextElementFields({
	element,
	onChange,
}: {
	element: BadgeElement & { type: 'TEXT' }
	onChange: (updates: Partial<BadgeElement>) => void
}) {
	return (
		<>
			<div>
				<Label htmlFor="content">Text Content</Label>
				<Input
					id="content"
					value={element.content}
					onChange={e => onChange({ content: e.target.value })}
					placeholder="Enter text..."
				/>
			</div>
			<TextStyleFields element={element} onChange={onChange} />
		</>
	)
}

function DynamicTextElementFields({
	element,
	onChange,
}: {
	element: BadgeElement & { type: 'DYNAMIC_TEXT' }
	onChange: (updates: Partial<BadgeElement>) => void
}) {
	return (
		<>
			<div>
				<Label htmlFor="field">Data Field</Label>
				<Select
					value={element.field}
					onValueChange={value => onChange({ field: value } as any)}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{DYNAMIC_FIELDS.map(field => (
							<SelectItem key={field.value} value={field.value}>
								{field.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<div>
					<Label htmlFor="prefix">Prefix</Label>
					<Input
						id="prefix"
						value={element.prefix ?? ''}
						onChange={e => onChange({ prefix: e.target.value } as any)}
						placeholder="e.g., Name: "
					/>
				</div>
				<div>
					<Label htmlFor="suffix">Suffix</Label>
					<Input
						id="suffix"
						value={element.suffix ?? ''}
						onChange={e => onChange({ suffix: e.target.value } as any)}
						placeholder="e.g., (PhD)"
					/>
				</div>
			</div>
			<TextStyleFields element={element} onChange={onChange} />
		</>
	)
}

function QRCodeElementFields({
	element,
	onChange,
}: {
	element: BadgeElement & { type: 'QR_CODE' }
	onChange: (updates: Partial<BadgeElement>) => void
}) {
	return (
		<div>
			<Label htmlFor="dataField">Data to Encode</Label>
			<Select
				value={element.dataField ?? 'profileUrl'}
				onValueChange={value => onChange({ dataField: value } as any)}
			>
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="profileUrl">Profile URL</SelectItem>
					<SelectItem value="badgeId">Badge ID</SelectItem>
					<SelectItem value="email">Email</SelectItem>
				</SelectContent>
			</Select>
		</div>
	)
}

function ImageElementFields({
	element,
	onChange,
}: {
	element: BadgeElement & { type: 'IMAGE' }
	onChange: (updates: Partial<BadgeElement>) => void
}) {
	return (
		<>
			<div>
				<Label htmlFor="src">Image URL</Label>
				<Input
					id="src"
					value={element.src}
					onChange={e => onChange({ src: e.target.value } as any)}
					placeholder="https://..."
				/>
			</div>
			<div>
				<Label htmlFor="objectFit">Object Fit</Label>
				<Select
					value={element.objectFit ?? 'contain'}
					onValueChange={value => onChange({ objectFit: value } as any)}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="contain">Contain</SelectItem>
						<SelectItem value="cover">Cover</SelectItem>
						<SelectItem value="fill">Fill</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</>
	)
}

function ShapeElementFields({
	element,
	onChange,
}: {
	element: BadgeElement & { type: 'SHAPE' }
	onChange: (updates: Partial<BadgeElement>) => void
}) {
	return (
		<>
			<div>
				<Label htmlFor="shapeType">Shape Type</Label>
				<Select
					value={element.shapeType}
					onValueChange={value => onChange({ shapeType: value } as any)}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="rectangle">Rectangle</SelectItem>
						<SelectItem value="circle">Circle</SelectItem>
						<SelectItem value="line">Line</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<div>
					<Label htmlFor="backgroundColor">Background Color</Label>
					<div className="flex gap-2">
						<Input
							id="backgroundColor"
							type="color"
							value={element.backgroundColor ?? '#e5e7eb'}
							onChange={e =>
								onChange({ backgroundColor: e.target.value } as any)
							}
							className="h-9 w-12 p-1"
						/>
						<Input
							value={element.backgroundColor ?? '#e5e7eb'}
							onChange={e =>
								onChange({ backgroundColor: e.target.value } as any)
							}
							className="flex-1"
						/>
					</div>
				</div>
				<div>
					<Label htmlFor="borderRadius">Border Radius</Label>
					<Input
						id="borderRadius"
						type="number"
						min={0}
						value={element.borderRadius ?? 0}
						onChange={e =>
							onChange({ borderRadius: Number(e.target.value) } as any)
						}
					/>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<div>
					<Label htmlFor="borderWidth">Border Width</Label>
					<Input
						id="borderWidth"
						type="number"
						min={0}
						value={element.borderWidth ?? 0}
						onChange={e =>
							onChange({ borderWidth: Number(e.target.value) } as any)
						}
					/>
				</div>
				<div>
					<Label htmlFor="borderColor">Border Color</Label>
					<div className="flex gap-2">
						<Input
							id="borderColor"
							type="color"
							value={element.borderColor ?? '#000000'}
							onChange={e => onChange({ borderColor: e.target.value } as any)}
							className="h-9 w-12 p-1"
						/>
						<Input
							value={element.borderColor ?? '#000000'}
							onChange={e => onChange({ borderColor: e.target.value } as any)}
							className="flex-1"
						/>
					</div>
				</div>
			</div>
			<div>
				<Label htmlFor="opacity">Opacity (0-1)</Label>
				<Input
					id="opacity"
					type="number"
					min={0}
					max={1}
					step={0.1}
					value={element.opacity ?? 1}
					onChange={e => onChange({ opacity: Number(e.target.value) } as any)}
				/>
			</div>
		</>
	)
}

function TextStyleFields({
	element,
	onChange,
}: {
	element: BadgeElement & { style?: any }
	onChange: (updates: Partial<BadgeElement>) => void
}) {
	const style = element.style ?? {}

	const updateStyle = (updates: Record<string, any>) => {
		onChange({ style: { ...style, ...updates } } as any)
	}

	return (
		<>
			<div className="grid grid-cols-3 gap-2">
				<div>
					<Label htmlFor="fontSize">Font Size</Label>
					<Input
						id="fontSize"
						type="number"
						min={6}
						max={72}
						value={style.fontSize ?? 10}
						onChange={e => updateStyle({ fontSize: Number(e.target.value) })}
					/>
				</div>
				<div>
					<Label htmlFor="fontWeight">Weight</Label>
					<Select
						value={style.fontWeight ?? 'normal'}
						onValueChange={value => updateStyle({ fontWeight: value })}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="normal">Normal</SelectItem>
							<SelectItem value="bold">Bold</SelectItem>
							<SelectItem value="ultrabold">Ultra Bold</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div>
					<Label htmlFor="textAlign">Align</Label>
					<Select
						value={style.textAlign ?? 'left'}
						onValueChange={value => updateStyle({ textAlign: value })}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="left">Left</SelectItem>
							<SelectItem value="center">Center</SelectItem>
							<SelectItem value="right">Right</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<div>
					<Label htmlFor="color">Text Color</Label>
					<div className="flex gap-2">
						<Input
							id="color"
							type="color"
							value={style.color ?? '#000000'}
							onChange={e => updateStyle({ color: e.target.value })}
							className="h-9 w-12 p-1"
						/>
						<Input
							value={style.color ?? '#000000'}
							onChange={e => updateStyle({ color: e.target.value })}
							className="flex-1"
						/>
					</div>
				</div>
				<div>
					<Label htmlFor="bgColor">Background</Label>
					<div className="flex gap-2">
						<Input
							id="bgColor"
							type="color"
							value={style.backgroundColor ?? '#ffffff'}
							onChange={e => updateStyle({ backgroundColor: e.target.value })}
							className="h-9 w-12 p-1"
						/>
						<Input
							value={style.backgroundColor ?? ''}
							onChange={e => updateStyle({ backgroundColor: e.target.value })}
							placeholder="transparent"
							className="flex-1"
						/>
					</div>
				</div>
			</div>
		</>
	)
}
