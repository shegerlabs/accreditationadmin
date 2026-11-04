import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { BadgeElement, DYNAMIC_FIELDS } from './types'

interface PropertyPanelProps {
	element: BadgeElement | null
	onChange: (updates: Partial<BadgeElement>) => void
}

export function PropertyPanel({ element, onChange }: PropertyPanelProps) {
	if (!element) {
		return (
			<div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
				Select an element on the canvas to edit its properties
			</div>
		)
	}

	const updateStyle = (updates: Record<string, any>) => {
		onChange({ style: { ...(element as any).style, ...updates } } as any)
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<div className="text-sm font-medium">
				{element.type.replace('_', ' ')} Properties
			</div>

			<Tabs defaultValue="position" className="w-full">
				<TabsList className="grid w-full grid-cols-3">
					<TabsTrigger value="position">Position</TabsTrigger>
					<TabsTrigger value="content">Content</TabsTrigger>
					<TabsTrigger value="style">Style</TabsTrigger>
				</TabsList>

				{/* Position Tab */}
				<TabsContent value="position" className="space-y-4">
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

					<div className="grid grid-cols-2 gap-2">
						<div>
							<Label htmlFor="x">X Position</Label>
							<Input
								id="x"
								type="number"
								value={element.x}
								onChange={e => onChange({ x: Number(e.target.value) })}
							/>
						</div>
						<div>
							<Label htmlFor="y">Y Position</Label>
							<Input
								id="y"
								type="number"
								value={element.y}
								onChange={e => onChange({ y: Number(e.target.value) })}
							/>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-2">
						<div>
							<Label htmlFor="width">Width</Label>
							<Input
								id="width"
								type="number"
								min={10}
								value={element.width}
								onChange={e => onChange({ width: Number(e.target.value) })}
							/>
						</div>
						<div>
							<Label htmlFor="height">Height</Label>
							<Input
								id="height"
								type="number"
								min={10}
								value={element.height}
								onChange={e => onChange({ height: Number(e.target.value) })}
							/>
						</div>
					</div>
				</TabsContent>

				{/* Content Tab */}
				<TabsContent value="content" className="space-y-4">
					{element.type === 'TEXT' && (
						<div>
							<Label htmlFor="content">Text Content</Label>
							<Input
								id="content"
								value={(element as any).content ?? ''}
								onChange={e => onChange({ content: e.target.value } as any)}
								placeholder="Enter text..."
							/>
						</div>
					)}

					{element.type === 'DYNAMIC_TEXT' && (
						<>
							<div>
								<Label htmlFor="field">Data Field</Label>
								<Select
									value={(element as any).field}
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
										value={(element as any).prefix ?? ''}
										onChange={e =>
											onChange({ prefix: e.target.value } as any)
										}
										placeholder="e.g., Name: "
									/>
								</div>
								<div>
									<Label htmlFor="suffix">Suffix</Label>
									<Input
										id="suffix"
										value={(element as any).suffix ?? ''}
										onChange={e =>
											onChange({ suffix: e.target.value } as any)
										}
									/>
								</div>
							</div>
						</>
					)}

					{element.type === 'QR_CODE' && (
						<div>
							<Label htmlFor="dataField">Data to Encode</Label>
							<Select
								value={(element as any).dataField ?? 'profileUrl'}
								onValueChange={value =>
									onChange({ dataField: value } as any)
								}
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
					)}

					{element.type === 'IMAGE' && (
						<div>
							<Label htmlFor="src">Image URL</Label>
							<Input
								id="src"
								value={(element as any).src ?? ''}
								onChange={e => onChange({ src: e.target.value } as any)}
								placeholder="https://..."
							/>
						</div>
					)}

					{element.type === 'SHAPE' && (
						<div>
							<Label htmlFor="shapeType">Shape Type</Label>
							<Select
								value={(element as any).shapeType ?? 'rectangle'}
								onValueChange={value =>
									onChange({ shapeType: value } as any)
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="rectangle">Rectangle</SelectItem>
									<SelectItem value="circle">Circle</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}

					{(element.type === 'PHOTO' || element.type === 'QR_CODE') && (
						<p className="text-xs text-muted-foreground">
							{element.type === 'PHOTO'
								? 'Photo will be pulled from participant data'
								: 'QR code will be generated from selected data field'}
						</p>
					)}
				</TabsContent>

				{/* Style Tab */}
				<TabsContent value="style" className="space-y-4">
					{(element.type === 'TEXT' || element.type === 'DYNAMIC_TEXT') && (
						<>
							<div className="grid grid-cols-2 gap-2">
								<div>
									<Label htmlFor="fontSize">Font Size</Label>
									<Input
										id="fontSize"
										type="number"
										min={6}
										max={72}
										value={(element as any).style?.fontSize ?? 10}
										onChange={e =>
											updateStyle({ fontSize: Number(e.target.value) })
										}
									/>
								</div>
								<div>
									<Label htmlFor="fontWeight">Weight</Label>
									<Select
										value={(element as any).style?.fontWeight ?? 'normal'}
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
							</div>

							<div>
								<Label htmlFor="fontStyle">Style</Label>
								<Select
									value={(element as any).style?.fontStyle ?? 'normal'}
									onValueChange={value => updateStyle({ fontStyle: value })}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="normal">Normal</SelectItem>
										<SelectItem value="italic">Italic</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div>
								<Label htmlFor="textAlign">Text Align</Label>
								<Select
									value={(element as any).style?.textAlign ?? 'left'}
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

							<div>
								<Label htmlFor="color">Text Color</Label>
								<div className="flex gap-2">
									<Input
										id="color"
										type="color"
										value={(element as any).style?.color ?? '#000000'}
										onChange={e => updateStyle({ color: e.target.value })}
										className="h-9 w-14 p-1"
									/>
									<Input
										value={(element as any).style?.color ?? '#000000'}
										onChange={e => updateStyle({ color: e.target.value })}
										className="flex-1"
									/>
								</div>
							</div>

							<div>
								<Label htmlFor="bgColor">Background Color</Label>
								<div className="flex gap-2">
									<Input
										id="bgColor"
										type="color"
										value={
											(element as any).style?.backgroundColor ?? '#ffffff'
										}
										onChange={e =>
											updateStyle({ backgroundColor: e.target.value })
										}
										className="h-9 w-14 p-1"
									/>
									<Input
										value={(element as any).style?.backgroundColor ?? ''}
										onChange={e =>
											updateStyle({ backgroundColor: e.target.value })
										}
										placeholder="transparent"
										className="flex-1"
									/>
								</div>
							</div>
						</>
					)}

					{element.type === 'SHAPE' && (
						<>
							<div>
								<Label htmlFor="backgroundColor">Fill Color</Label>
								<div className="flex gap-2">
									<Input
										id="backgroundColor"
										type="color"
										value={(element as any).backgroundColor ?? '#e5e7eb'}
										onChange={e =>
											onChange({ backgroundColor: e.target.value } as any)
										}
										className="h-9 w-14 p-1"
									/>
									<Input
										value={(element as any).backgroundColor ?? '#e5e7eb'}
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
									value={(element as any).borderRadius ?? 0}
									onChange={e =>
										onChange({ borderRadius: Number(e.target.value) } as any)
									}
								/>
							</div>

							<div>
								<Label htmlFor="opacity">Opacity (0-1)</Label>
								<Input
									id="opacity"
									type="number"
									min={0}
									max={1}
									step={0.1}
									value={(element as any).opacity ?? 1}
									onChange={e =>
										onChange({ opacity: Number(e.target.value) } as any)
									}
								/>
							</div>
						</>
					)}

					{(element.type === 'PHOTO' || element.type === 'QR_CODE') && (
						<>
							<div className="grid grid-cols-2 gap-2">
								<div>
									<Label htmlFor="borderWidth">Border Width</Label>
									<Input
										id="borderWidth"
										type="number"
										min={0}
										value={(element as any).borderWidth ?? 0}
										onChange={e =>
											onChange({ borderWidth: Number(e.target.value) } as any)
										}
									/>
								</div>
								<div>
									<Label htmlFor="borderRadius">Border Radius</Label>
									<Select
										value={
											(element as any).borderRadius === 'full'
												? 'full'
												: String((element as any).borderRadius ?? 0)
										}
										onValueChange={value => {
											if (value === 'full') {
												onChange({ borderRadius: 'full' } as any)
											} else {
												onChange({ borderRadius: Number(value) } as any)
											}
										}}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="0">None</SelectItem>
											<SelectItem value="4">Small (4)</SelectItem>
											<SelectItem value="8">Medium (8)</SelectItem>
											<SelectItem value="12">Large (12)</SelectItem>
											<SelectItem value="full">Full (Circle)</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
							<div>
								<Label htmlFor="borderColor">Border Color</Label>
								<div className="flex gap-2">
									<Input
										id="borderColor"
										type="color"
										value={(element as any).borderColor ?? '#000000'}
										onChange={e =>
											onChange({ borderColor: e.target.value } as any)
										}
										className="h-9 w-14 p-1"
									/>
									<Input
										value={(element as any).borderColor ?? '#000000'}
										onChange={e =>
											onChange({ borderColor: e.target.value } as any)
										}
										className="flex-1"
									/>
								</div>
							</div>
						</>
					)}

					{element.type === 'IMAGE' && (
						<div>
							<Label htmlFor="objectFit">Object Fit</Label>
							<Select
								value={(element as any).objectFit ?? 'contain'}
								onValueChange={value =>
									onChange({ objectFit: value } as any)
								}
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
					)}
				</TabsContent>
			</Tabs>
		</div>
	)
}
