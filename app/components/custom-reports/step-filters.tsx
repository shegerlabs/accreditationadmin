import { Plus, Trash2 } from 'lucide-react'
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
import { WizardStepContent } from '~/components/wizard'
import type {
	DataSourceType,
	FilterOperator,
	ReportFilter,
} from '~/utils/custom-report-types'
import {
	getFieldDefinition,
	getFieldsForDataSource,
	getOperatorsForType,
} from '~/utils/custom-report-schema'

interface StepFiltersProps {
	dataSource: DataSourceType
	filters: ReportFilter[]
	onFiltersChange: (filters: ReportFilter[]) => void
}

export function StepFilters({
	dataSource,
	filters,
	onFiltersChange,
}: StepFiltersProps) {
	const fields = getFieldsForDataSource(dataSource)

	const addFilter = () => {
		const defaultField = fields[0]
		if (!defaultField) return

		const operators = getOperatorsForType(defaultField.type)
		const defaultOperator = operators[0]?.value as FilterOperator

		onFiltersChange([
			...filters,
			{
				field: defaultField.path,
				operator: defaultOperator,
				value: '',
			},
		])
	}

	const removeFilter = (index: number) => {
		onFiltersChange(filters.filter((_, i) => i !== index))
	}

	const updateFilter = (index: number, updates: Partial<ReportFilter>) => {
		onFiltersChange(
			filters.map((filter, i) =>
				i === index ? { ...filter, ...updates } : filter,
			),
		)
	}

	const handleFieldChange = (index: number, fieldPath: string) => {
		const fieldDef = getFieldDefinition(dataSource, fieldPath)
		if (!fieldDef) return

		const operators = getOperatorsForType(fieldDef.type)
		const newOperator = operators[0]?.value as FilterOperator

		updateFilter(index, {
			field: fieldPath,
			operator: newOperator,
			value: fieldDef.type === 'boolean' ? 'true' : '',
		})
	}

	return (
		<WizardStepContent
			title="Add Filters"
			description="Filter your report data by adding conditions. Filters are optional."
		>
			<div className="space-y-4">
				{filters.length === 0 ? (
					<div className="rounded-lg border border-dashed p-8 text-center">
						<p className="text-sm text-muted-foreground">
							No filters added. Your report will include all records.
						</p>
						<Button
							type="button"
							variant="outline"
							className="mt-4"
							onClick={addFilter}
						>
							<Plus className="mr-2 h-4 w-4" />
							Add Filter
						</Button>
					</div>
				) : (
					<>
						<div className="space-y-3">
							{filters.map((filter, index) => (
								<FilterRow
									key={index}
									filter={filter}
									dataSource={dataSource}
									fields={fields}
									onFieldChange={(field) => handleFieldChange(index, field)}
									onOperatorChange={(operator) =>
										updateFilter(index, { operator: operator as FilterOperator })
									}
									onValueChange={(value) => updateFilter(index, { value })}
									onRemove={() => removeFilter(index)}
								/>
							))}
						</div>

						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addFilter}
						>
							<Plus className="mr-2 h-4 w-4" />
							Add Filter
						</Button>
					</>
				)}

				{filters.length > 1 && (
					<p className="text-xs text-muted-foreground">
						Multiple filters are combined with AND logic.
					</p>
				)}
			</div>
		</WizardStepContent>
	)
}

function FilterRow({
	filter,
	dataSource,
	fields,
	onFieldChange,
	onOperatorChange,
	onValueChange,
	onRemove,
}: {
	filter: ReportFilter
	dataSource: DataSourceType
	fields: { path: string; label: string; type: string; enumValues?: string[] }[]
	onFieldChange: (field: string) => void
	onOperatorChange: (operator: string) => void
	onValueChange: (value: unknown) => void
	onRemove: () => void
}) {
	const fieldDef = getFieldDefinition(dataSource, filter.field)
	const operators = fieldDef
		? getOperatorsForType(fieldDef.type)
		: [{ value: 'equals', label: 'Equals' }]

	const needsValue =
		filter.operator !== 'isNull' && filter.operator !== 'isNotNull'

	return (
		<div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-4">
			{/* Field Select */}
			<div className="flex-1 min-w-[180px]">
				<Label className="text-xs text-muted-foreground">Field</Label>
				<Select value={filter.field} onValueChange={onFieldChange}>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{fields.map((field) => (
							<SelectItem key={field.path} value={field.path}>
								{field.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Operator Select */}
			<div className="w-[160px]">
				<Label className="text-xs text-muted-foreground">Condition</Label>
				<Select value={filter.operator} onValueChange={onOperatorChange}>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{operators.map((op) => (
							<SelectItem key={op.value} value={op.value}>
								{op.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Value Input */}
			{needsValue && (
				<div className="flex-1 min-w-[180px]">
					<Label className="text-xs text-muted-foreground">Value</Label>
					<FilterValueInput
						fieldDef={fieldDef}
						value={filter.value}
						onChange={onValueChange}
					/>
				</div>
			)}

			{/* Remove Button */}
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="shrink-0"
				onClick={onRemove}
			>
				<Trash2 className="h-4 w-4" />
			</Button>
		</div>
	)
}

function FilterValueInput({
	fieldDef,
	value,
	onChange,
}: {
	fieldDef?: { type: string; enumValues?: string[] }
	value: unknown
	onChange: (value: unknown) => void
}) {
	if (!fieldDef) {
		return (
			<Input
				value={String(value ?? '')}
				onChange={(e) => onChange(e.target.value)}
				placeholder="Enter value"
			/>
		)
	}

	switch (fieldDef.type) {
		case 'boolean':
			return (
				<Select
					value={String(value ?? 'true')}
					onValueChange={(v) => onChange(v === 'true')}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="true">Yes</SelectItem>
						<SelectItem value="false">No</SelectItem>
					</SelectContent>
				</Select>
			)

		case 'enum':
			return (
				<Select value={String(value ?? '')} onValueChange={onChange}>
					<SelectTrigger>
						<SelectValue placeholder="Select value" />
					</SelectTrigger>
					<SelectContent>
						{fieldDef.enumValues?.map((val) => (
							<SelectItem key={val} value={val}>
								{val}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)

		case 'date':
			return (
				<Input
					type="date"
					value={String(value ?? '')}
					onChange={(e) => onChange(e.target.value)}
				/>
			)

		case 'number':
			return (
				<Input
					type="number"
					value={String(value ?? '')}
					onChange={(e) => onChange(e.target.value)}
					placeholder="Enter number"
				/>
			)

		default:
			return (
				<Input
					value={String(value ?? '')}
					onChange={(e) => onChange(e.target.value)}
					placeholder="Enter value"
				/>
			)
	}
}
