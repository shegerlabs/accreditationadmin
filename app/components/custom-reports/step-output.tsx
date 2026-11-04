import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Checkbox } from '~/components/ui/checkbox'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { WizardStepContent } from '~/components/wizard'
import type {
	AggregationType,
	DataSourceType,
	ReportAggregation,
	ReportSorting,
	SelectedField,
} from '~/utils/custom-report-types'
import { getFieldsForDataSource } from '~/utils/custom-report-schema'

interface StepOutputProps {
	dataSource: DataSourceType
	selectedFields: SelectedField[]
	groupBy: string[]
	aggregations: ReportAggregation[]
	sorting: ReportSorting[]
	limit?: number
	onGroupByChange: (groupBy: string[]) => void
	onAggregationsChange: (aggregations: ReportAggregation[]) => void
	onSortingChange: (sorting: ReportSorting[]) => void
	onLimitChange: (limit: number | undefined) => void
}

export function StepOutput({
	dataSource,
	selectedFields,
	groupBy,
	aggregations,
	sorting,
	limit,
	onGroupByChange,
	onAggregationsChange,
	onSortingChange,
	onLimitChange,
}: StepOutputProps) {
	const fields = getFieldsForDataSource(dataSource)
	const selectedFieldPaths = selectedFields.map((f) => f.path)

	// Get numeric fields for aggregations
	const numericFields = fields.filter(
		(f) => f.type === 'number' && selectedFieldPaths.includes(f.path),
	)

	// Grouping handlers
	const toggleGroupBy = (field: string) => {
		if (groupBy.includes(field)) {
			onGroupByChange(groupBy.filter((f) => f !== field))
		} else {
			onGroupByChange([...groupBy, field])
		}
	}

	// Aggregation handlers
	const addAggregation = () => {
		const defaultField = numericFields[0] || fields[0]
		onAggregationsChange([
			...aggregations,
			{
				field: defaultField?.path || 'id',
				type: 'count',
			},
		])
	}

	const removeAggregation = (index: number) => {
		onAggregationsChange(aggregations.filter((_, i) => i !== index))
	}

	const updateAggregation = (
		index: number,
		updates: Partial<ReportAggregation>,
	) => {
		onAggregationsChange(
			aggregations.map((agg, i) => (i === index ? { ...agg, ...updates } : agg)),
		)
	}

	// Sorting handlers
	const addSort = () => {
		const defaultField = selectedFieldPaths[0] || fields[0]?.path
		if (!defaultField) return
		onSortingChange([...sorting, { field: defaultField, direction: 'asc' }])
	}

	const removeSort = (index: number) => {
		onSortingChange(sorting.filter((_, i) => i !== index))
	}

	const updateSort = (index: number, updates: Partial<ReportSorting>) => {
		onSortingChange(
			sorting.map((sort, i) => (i === index ? { ...sort, ...updates } : sort)),
		)
	}

	const toggleSortDirection = (index: number) => {
		const current = sorting[index]
		if (!current) return
		updateSort(index, {
			direction: current.direction === 'asc' ? 'desc' : 'asc',
		})
	}

	return (
		<WizardStepContent
			title="Configure Output"
			description="Set up grouping, aggregations, and sorting for your report."
		>
			<div className="space-y-8">
				{/* Grouping Section */}
				<div className="space-y-3">
					<div>
						<h3 className="text-sm font-medium">Group By (Optional)</h3>
						<p className="text-xs text-muted-foreground">
							Group results by one or more fields to get aggregated data.
						</p>
					</div>

					<div className="flex flex-wrap gap-2">
						{selectedFields.map((field) => {
							const fieldDef = fields.find((f) => f.path === field.path)
							const isGrouped = groupBy.includes(field.path)
							// Only allow grouping on non-date, non-boolean fields typically
							const canGroup =
								fieldDef &&
								(fieldDef.type === 'string' || fieldDef.type === 'enum')

							if (!canGroup) return null

							return (
								<div
									key={field.path}
									className="flex items-center gap-2 rounded-md border px-3 py-2"
								>
									<Checkbox
										id={`group-${field.path}`}
										checked={isGrouped}
										onCheckedChange={() => toggleGroupBy(field.path)}
									/>
									<Label
										htmlFor={`group-${field.path}`}
										className="cursor-pointer text-sm"
									>
										{fieldDef?.label || field.path}
									</Label>
								</div>
							)
						})}
					</div>

					{groupBy.length > 0 && (
						<p className="text-xs text-muted-foreground">
							Results will be grouped by: {groupBy.join(', ')}
						</p>
					)}
				</div>

				{/* Aggregations Section (only show if grouping is enabled) */}
				{groupBy.length > 0 && (
					<div className="space-y-3">
						<div>
							<h3 className="text-sm font-medium">Aggregations</h3>
							<p className="text-xs text-muted-foreground">
								Calculate summary values for each group.
							</p>
						</div>

						{aggregations.length === 0 ? (
							<div className="rounded-lg border border-dashed p-4 text-center">
								<p className="text-sm text-muted-foreground">
									No aggregations added. A count will be included by default.
								</p>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="mt-2"
									onClick={addAggregation}
								>
									<Plus className="mr-2 h-4 w-4" />
									Add Aggregation
								</Button>
							</div>
						) : (
							<>
								<div className="space-y-2">
									{aggregations.map((agg, index) => (
										<div
											key={index}
											className="flex items-end gap-3 rounded-lg border bg-muted/30 p-3"
										>
											<div className="w-[120px]">
												<Label className="text-xs text-muted-foreground">
													Function
												</Label>
												<Select
													value={agg.type}
													onValueChange={(v) =>
														updateAggregation(index, {
															type: v as AggregationType,
														})
													}
												>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="count">Count</SelectItem>
														<SelectItem value="sum">Sum</SelectItem>
														<SelectItem value="avg">Average</SelectItem>
														<SelectItem value="min">Minimum</SelectItem>
														<SelectItem value="max">Maximum</SelectItem>
													</SelectContent>
												</Select>
											</div>

											{agg.type !== 'count' && (
												<div className="flex-1">
													<Label className="text-xs text-muted-foreground">
														Field
													</Label>
													<Select
														value={agg.field}
														onValueChange={(v) =>
															updateAggregation(index, { field: v })
														}
													>
														<SelectTrigger>
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{numericFields.map((f) => (
																<SelectItem key={f.path} value={f.path}>
																	{f.label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
											)}

											<div className="w-[140px]">
												<Label className="text-xs text-muted-foreground">
													Label (optional)
												</Label>
												<Input
													value={agg.alias || ''}
													onChange={(e) =>
														updateAggregation(index, {
															alias: e.target.value || undefined,
														})
													}
													placeholder="Column name"
												/>
											</div>

											<Button
												type="button"
												variant="ghost"
												size="icon"
												onClick={() => removeAggregation(index)}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									))}
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={addAggregation}
								>
									<Plus className="mr-2 h-4 w-4" />
									Add Aggregation
								</Button>
							</>
						)}
					</div>
				)}

				{/* Sorting Section */}
				<div className="space-y-3">
					<div>
						<h3 className="text-sm font-medium">Sorting</h3>
						<p className="text-xs text-muted-foreground">
							Order results by one or more fields.
						</p>
					</div>

					{sorting.length === 0 ? (
						<div className="rounded-lg border border-dashed p-4 text-center">
							<p className="text-sm text-muted-foreground">
								No sorting specified. Results will be ordered by creation date
								(newest first).
							</p>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="mt-2"
								onClick={addSort}
							>
								<Plus className="mr-2 h-4 w-4" />
								Add Sort
							</Button>
						</div>
					) : (
						<>
							<div className="space-y-2">
								{sorting.map((sort, index) => {
									const fieldDef = fields.find((f) => f.path === sort.field)

									return (
										<div
											key={index}
											className="flex items-end gap-3 rounded-lg border bg-muted/30 p-3"
										>
											<div className="flex-1">
												<Label className="text-xs text-muted-foreground">
													Field
												</Label>
												<Select
													value={sort.field}
													onValueChange={(v) =>
														updateSort(index, { field: v })
													}
												>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{selectedFields.map((f) => {
															const fd = fields.find(
																(field) => field.path === f.path,
															)
															return (
																<SelectItem key={f.path} value={f.path}>
																	{fd?.label || f.path}
																</SelectItem>
															)
														})}
													</SelectContent>
												</Select>
											</div>

											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => toggleSortDirection(index)}
												className="w-[100px]"
											>
												{sort.direction === 'asc' ? (
													<>
														<ArrowUp className="mr-2 h-4 w-4" />
														Asc
													</>
												) : (
													<>
														<ArrowDown className="mr-2 h-4 w-4" />
														Desc
													</>
												)}
											</Button>

											<Button
												type="button"
												variant="ghost"
												size="icon"
												onClick={() => removeSort(index)}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									)
								})}
							</div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={addSort}
							>
								<Plus className="mr-2 h-4 w-4" />
								Add Sort
							</Button>
						</>
					)}
				</div>

				{/* Row Limit Section */}
				<div className="space-y-3">
					<div>
						<h3 className="text-sm font-medium">Row Limit</h3>
						<p className="text-xs text-muted-foreground">
							Maximum number of rows to return (up to 1000).
						</p>
					</div>

					<div className="w-[200px]">
						<Input
							type="number"
							min={1}
							max={1000}
							value={limit || ''}
							onChange={(e) =>
								onLimitChange(
									e.target.value ? parseInt(e.target.value, 10) : undefined,
								)
							}
							placeholder="100"
						/>
					</div>
				</div>
			</div>
		</WizardStepContent>
	)
}
