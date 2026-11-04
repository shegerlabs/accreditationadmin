import { useState } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Link2, Plus, X } from 'lucide-react'
import { Checkbox } from '~/components/ui/checkbox'
import { Label } from '~/components/ui/label'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { WizardStepContent } from '~/components/wizard'
import type { ComputedField, DataSourceType, SelectedField } from '~/utils/custom-report-types'
import {
	getFieldsGrouped,
	type FieldDefinition,
} from '~/utils/custom-report-schema'
import { cn } from '~/utils/misc'

interface StepFieldsProps {
	dataSource: DataSourceType
	selectedFields: SelectedField[]
	onFieldsChange: (fields: SelectedField[]) => void
	computedFields?: ComputedField[]
	onComputedFieldsChange?: (fields: ComputedField[]) => void
	fieldOrder: string[]
	onFieldOrderChange: (order: string[]) => void
}

export function StepFields({
	dataSource,
	selectedFields,
	onFieldsChange,
	computedFields = [],
	onComputedFieldsChange,
	fieldOrder,
	onFieldOrderChange,
}: StepFieldsProps) {
	const { direct, relations } = getFieldsGrouped(dataSource)
	const [expandedRelations, setExpandedRelations] = useState<Set<string>>(
		new Set(),
	)
	const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
	const [showAddMerged, setShowAddMerged] = useState(false)
	const [newMergedName, setNewMergedName] = useState('')
	const [newMergedFields, setNewMergedFields] = useState<string[]>([])
	const [newMergedSeparator, setNewMergedSeparator] = useState(' ')

	const selectedPaths = new Set(selectedFields.map((f) => f.path))
	const allFields = [...direct, ...Array.from(relations.values()).flat()]

	const toggleField = (field: FieldDefinition) => {
		if (selectedPaths.has(field.path)) {
			onFieldsChange(selectedFields.filter((f) => f.path !== field.path))
			onFieldOrderChange(fieldOrder.filter((key) => key !== field.path))
		} else {
			onFieldsChange([...selectedFields, { path: field.path }])
			onFieldOrderChange([...fieldOrder, field.path])
		}
	}

	const toggleRelation = (relation: string) => {
		setExpandedRelations((prev) => {
			const next = new Set(prev)
			if (next.has(relation)) {
				next.delete(relation)
			} else {
				next.add(relation)
			}
			return next
		})
	}

	const selectAll = () => {
		const allFieldDefs = [
			...direct,
			...Array.from(relations.values()).flat(),
		]
		const allFieldsList = allFieldDefs.map((f) => ({ path: f.path }))
		onFieldsChange(allFieldsList)
		// Keep computed fields in order, add new fields at the end
		const computedKeys = computedFields.map((cf) => `computed_${cf.id}`)
		const newFieldOrder = [
			...fieldOrder.filter((key) => computedKeys.includes(key)),
			...allFieldDefs.map((f) => f.path),
		]
		onFieldOrderChange(newFieldOrder)
	}

	const selectNone = () => {
		onFieldsChange([])
		// Keep only computed fields in order
		const computedKeys = computedFields.map((cf) => `computed_${cf.id}`)
		onFieldOrderChange(fieldOrder.filter((key) => computedKeys.includes(key)))
	}

	const getTypeColor = (type: string) => {
		switch (type) {
			case 'string':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
			case 'number':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
			case 'date':
				return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
			case 'boolean':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
			case 'enum':
				return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200'
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
		}
	}

	return (
		<WizardStepContent
			title="Select Fields"
			description="Choose which fields to include in your report. You can include fields from related models."
		>
			<div className="space-y-4">
				{/* Selection Controls */}
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						{selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''}{' '}
						selected
					</div>
					<div className="flex gap-2">
						<Button variant="outline" size="sm" onClick={selectAll}>
							Select All
						</Button>
						<Button variant="outline" size="sm" onClick={selectNone}>
							Clear
						</Button>
					</div>
				</div>

				{/* Direct Fields */}
				<div className="space-y-2">
					<h3 className="text-sm font-medium text-muted-foreground">
						Direct Fields
					</h3>
					<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{direct.map((field) => (
							<FieldCheckbox
								key={field.path}
								field={field}
								isSelected={selectedPaths.has(field.path)}
								onToggle={() => toggleField(field)}
								typeColor={getTypeColor(field.type)}
							/>
						))}
					</div>
				</div>

				{/* Related Fields */}
				{relations.size > 0 && (
					<div className="space-y-2">
						<h3 className="text-sm font-medium text-muted-foreground">
							Related Fields
						</h3>
						<div className="space-y-2">
							{Array.from(relations.entries()).map(([relation, fields]) => {
								const isExpanded = expandedRelations.has(relation)
								const selectedCount = fields.filter((f) =>
									selectedPaths.has(f.path),
								).length

								return (
									<div
										key={relation}
										className="rounded-lg border bg-card"
									>
										{/* Relation Header */}
										<button
											type="button"
											className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50"
											onClick={() => toggleRelation(relation)}
										>
											<div className="flex items-center gap-2">
												{isExpanded ? (
													<ChevronDown className="h-4 w-4" />
												) : (
													<ChevronRight className="h-4 w-4" />
												)}
												<span className="font-medium capitalize">
													{relation}
												</span>
												<Badge variant="secondary" className="ml-2">
													{fields.length} field{fields.length !== 1 ? 's' : ''}
												</Badge>
											</div>
											{selectedCount > 0 && (
												<Badge variant="default">
													{selectedCount} selected
												</Badge>
											)}
										</button>

										{/* Relation Fields */}
										{isExpanded && (
											<div className="border-t p-3">
												<div className="grid gap-2 sm:grid-cols-2">
													{fields.map((field) => (
														<FieldCheckbox
															key={field.path}
															field={field}
															isSelected={selectedPaths.has(field.path)}
															onToggle={() => toggleField(field)}
															typeColor={getTypeColor(field.type)}
														/>
													))}
												</div>
											</div>
										)}
									</div>
								)
							})}
						</div>
					</div>
				)}

				{/* Field Order (includes both regular and merged fields) */}
				{fieldOrder.length > 0 && (
					<div className="space-y-2">
						<h3 className="text-sm font-medium text-muted-foreground">
							Field Order (drag to reorder)
						</h3>
						<div className="flex flex-wrap gap-2">
							{fieldOrder.map((key, index) => {
								const isComputed = key.startsWith('computed_')
								const computedField = isComputed
									? computedFields.find((cf) => `computed_${cf.id}` === key)
									: null
								const regularField = !isComputed
									? selectedFields.find((f) => f.path === key)
									: null

								// Skip if field no longer exists
								if (isComputed && !computedField) return null
								if (!isComputed && !regularField) return null

								const displayLabel = isComputed
									? computedField?.name
									: key

								return (
									<div
										key={key}
										draggable
										onDragStart={(e) => {
											setDraggedIndex(index)
											e.dataTransfer.effectAllowed = 'move'
										}}
										onDragEnd={() => {
											setDraggedIndex(null)
											setDragOverIndex(null)
										}}
										onDragOver={(e) => {
											e.preventDefault()
											e.dataTransfer.dropEffect = 'move'
											if (draggedIndex !== null && draggedIndex !== index) {
												setDragOverIndex(index)
											}
										}}
										onDragLeave={() => {
											setDragOverIndex(null)
										}}
										onDrop={(e) => {
											e.preventDefault()
											if (draggedIndex !== null && draggedIndex !== index) {
												const newOrder = [...fieldOrder]
												const [removed] = newOrder.splice(draggedIndex, 1)
												newOrder.splice(index, 0, removed)
												onFieldOrderChange(newOrder)
											}
											setDraggedIndex(null)
											setDragOverIndex(null)
										}}
										className={cn(
											'flex items-center gap-1 rounded-md border px-2 py-1 text-sm cursor-grab active:cursor-grabbing transition-all',
											isComputed
												? 'bg-primary/10 border-primary/30'
												: 'bg-muted/50',
											draggedIndex === index && 'opacity-50',
											dragOverIndex === index && 'ring-2 ring-primary ring-offset-1',
										)}
									>
										<GripVertical className="h-3 w-3 text-muted-foreground" />
										<span>{index + 1}.</span>
										{isComputed && <Link2 className="h-3 w-3 text-primary" />}
										<span>{displayLabel}</span>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation()
												if (isComputed && onComputedFieldsChange) {
													onComputedFieldsChange(
														computedFields.filter((cf) => `computed_${cf.id}` !== key)
													)
												} else {
													onFieldsChange(selectedFields.filter((f) => f.path !== key))
												}
												onFieldOrderChange(fieldOrder.filter((k) => k !== key))
											}}
											className="ml-1 text-muted-foreground hover:text-destructive"
										>
											<X className="h-3 w-3" />
										</button>
									</div>
								)
							})}
						</div>
					</div>
				)}

				{/* Merged Fields */}
				{onComputedFieldsChange && (
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-medium text-muted-foreground">
								Merged Fields
							</h3>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setShowAddMerged(!showAddMerged)}
							>
								<Plus className="mr-1 h-3 w-3" />
								Add Merged Field
							</Button>
						</div>

						{/* Existing Merged Fields */}
						{computedFields.length > 0 && (
							<div className="space-y-2">
								{computedFields.map((cf) => (
									<div
										key={cf.id}
										className="flex items-center justify-between rounded-lg border bg-primary/5 p-3"
									>
										<div className="flex items-center gap-2">
											<Link2 className="h-4 w-4 text-primary" />
											<div>
												<p className="font-medium">{cf.name}</p>
												<p className="text-xs text-muted-foreground">
													{cf.fields.join(` "${cf.separator}" `)}
												</p>
											</div>
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												onComputedFieldsChange(
													computedFields.filter((f) => f.id !== cf.id),
												)
											}
										>
											<X className="h-4 w-4" />
										</Button>
									</div>
								))}
							</div>
						)}

						{/* Add New Merged Field Form */}
						{showAddMerged && (
							<div className="rounded-lg border bg-muted/30 p-4 space-y-3">
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="space-y-1">
										<Label htmlFor="merged-name" className="text-xs">
											Display Name
										</Label>
										<Input
											id="merged-name"
											placeholder="e.g., Full Name"
											value={newMergedName}
											onChange={(e) => setNewMergedName(e.target.value)}
										/>
									</div>
									<div className="space-y-1">
										<Label htmlFor="merged-separator" className="text-xs">
											Separator
										</Label>
										<Select
											value={newMergedSeparator}
											onValueChange={setNewMergedSeparator}
										>
											<SelectTrigger id="merged-separator">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value=" ">Space</SelectItem>
												<SelectItem value=", ">Comma + Space</SelectItem>
												<SelectItem value=" - ">Dash</SelectItem>
												<SelectItem value=" | ">Pipe</SelectItem>
												<SelectItem value="none">None</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>

								<div className="space-y-1">
									<Label className="text-xs">
										Select Fields to Merge (in order)
									</Label>
									<div className="flex flex-wrap gap-2 rounded-md border bg-background p-2 min-h-[40px]">
										{newMergedFields.map((path, index) => {
											const fieldDef = allFields.find((f) => f.path === path)
											return (
												<Badge key={path} variant="secondary">
													{index + 1}. {fieldDef?.label || path}
													<button
														type="button"
														onClick={() =>
															setNewMergedFields(
																newMergedFields.filter((_, i) => i !== index),
															)
														}
														className="ml-1"
													>
														<X className="h-3 w-3" />
													</button>
												</Badge>
											)
										})}
										{newMergedFields.length === 0 && (
											<span className="text-xs text-muted-foreground">
												Click fields below to add them
											</span>
										)}
									</div>
									<div className="flex flex-wrap gap-1 mt-2">
										{allFields
											.filter((f) => f.type === 'string' && !newMergedFields.includes(f.path))
											.slice(0, 20)
											.map((field) => (
												<Badge
													key={field.path}
													variant="outline"
													className="cursor-pointer hover:bg-primary/10"
													onClick={() =>
														setNewMergedFields([...newMergedFields, field.path])
													}
												>
													+ {field.label}
												</Badge>
											))}
									</div>
								</div>

								<div className="flex justify-end gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											setShowAddMerged(false)
											setNewMergedName('')
											setNewMergedFields([])
											setNewMergedSeparator(' ')
										}}
									>
										Cancel
									</Button>
									<Button
										size="sm"
										disabled={!newMergedName || newMergedFields.length < 2}
										onClick={() => {
											const newField: ComputedField = {
												id: `merged_${Date.now()}`,
												name: newMergedName,
												fields: newMergedFields,
												separator: newMergedSeparator === 'none' ? '' : newMergedSeparator,
											}
											if (onComputedFieldsChange) {
												onComputedFieldsChange([...computedFields, newField])
											}
											// Add to field order
											onFieldOrderChange([...fieldOrder, `computed_${newField.id}`])
											setShowAddMerged(false)
											setNewMergedName('')
											setNewMergedFields([])
											setNewMergedSeparator(' ')
										}}
									>
										Add Merged Field
									</Button>
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		</WizardStepContent>
	)
}

function FieldCheckbox({
	field,
	isSelected,
	onToggle,
	typeColor,
}: {
	field: FieldDefinition
	isSelected: boolean
	onToggle: () => void
	typeColor: string
}) {
	return (
		<div
			className={cn(
				'flex items-center gap-3 rounded-lg border p-3 transition-colors',
				isSelected && 'border-primary bg-primary/5',
			)}
		>
			<Checkbox
				id={field.path}
				checked={isSelected}
				onCheckedChange={onToggle}
			/>
			<div className="flex-1 min-w-0">
				<Label
					htmlFor={field.path}
					className="cursor-pointer text-sm font-medium leading-none"
				>
					{field.label}
				</Label>
				<p className="text-xs text-muted-foreground truncate">
					{field.path}
				</p>
			</div>
			<Badge variant="outline" className={cn('text-xs', typeColor)}>
				{field.type}
			</Badge>
		</div>
	)
}
