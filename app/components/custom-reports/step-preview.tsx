import { Loader2 } from 'lucide-react'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Badge } from '~/components/ui/badge'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/components/ui/table'
import { WizardStepContent } from '~/components/wizard'
import type { ReportResult, WizardState } from '~/utils/custom-report-types'
import { getDataSourceInfo } from '~/utils/custom-report-schema'

interface Tenant {
	id: string
	name: string
}

interface StepPreviewProps {
	wizardState: WizardState
	previewData?: ReportResult
	isLoading?: boolean
	error?: string
	onNameChange: (name: string) => void
	onDescriptionChange: (description: string) => void
	onIsPublicChange: (isPublic: boolean) => void
	// For global admins
	isGlobalAdmin?: boolean
	tenants?: Tenant[]
	selectedTenantId?: string
	onTenantChange?: (tenantId: string) => void
}

export function StepPreview({
	wizardState,
	previewData,
	isLoading,
	error,
	onNameChange,
	onDescriptionChange,
	onIsPublicChange,
	isGlobalAdmin,
	tenants,
	selectedTenantId,
	onTenantChange,
}: StepPreviewProps) {
	const dataSourceInfo = wizardState.dataSource
		? getDataSourceInfo(wizardState.dataSource)
		: null

	return (
		<WizardStepContent
			title="Preview & Save"
			description="Review your report configuration and save it for future use."
		>
			<div className="space-y-8">
				{/* Report Details Form */}
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="report-name">
							Report Name <span className="text-destructive">*</span>
						</Label>
						<Input
							id="report-name"
							value={wizardState.name || ''}
							onChange={(e) => onNameChange(e.target.value)}
							placeholder="e.g., Monthly Participant Summary"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="report-description">Description</Label>
						<Input
							id="report-description"
							value={wizardState.description || ''}
							onChange={(e) => onDescriptionChange(e.target.value)}
							placeholder="Optional description"
						/>
					</div>

					{/* Tenant selector for global admins */}
					{isGlobalAdmin && tenants && tenants.length > 0 && onTenantChange && (
						<div className="space-y-2">
							<Label htmlFor="tenant">
								Tenant <span className="text-destructive">*</span>
							</Label>
							<Select value={selectedTenantId} onValueChange={onTenantChange}>
								<SelectTrigger id="tenant">
									<SelectValue placeholder="Select a tenant" />
								</SelectTrigger>
								<SelectContent>
									{tenants.map((tenant) => (
										<SelectItem key={tenant.id} value={tenant.id}>
											{tenant.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								The report will be saved to this tenant.
							</p>
						</div>
					)}

					<div className={isGlobalAdmin ? '' : 'sm:col-span-2'}>
						<div className="flex items-center justify-between rounded-lg border p-4">
							<div className="space-y-0.5">
								<Label htmlFor="is-public">Make Public</Label>
								<p className="text-sm text-muted-foreground">
									Allow other users in your tenant to view and run this report.
								</p>
							</div>
							<Switch
								id="is-public"
								checked={wizardState.isPublic || false}
								onCheckedChange={onIsPublicChange}
							/>
						</div>
					</div>
				</div>

				{/* Configuration Summary */}
				<div className="space-y-3">
					<h3 className="text-sm font-medium">Configuration Summary</h3>
					<div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
						<div>
							<p className="text-xs text-muted-foreground">Data Source</p>
							<p className="font-medium">{dataSourceInfo?.label || 'None'}</p>
						</div>
						<div>
							<p className="text-xs text-muted-foreground">Fields</p>
							<p className="font-medium">{wizardState.fields.length} selected</p>
						</div>
						<div>
							<p className="text-xs text-muted-foreground">Filters</p>
							<p className="font-medium">
								{wizardState.filters.length || 'None'}
							</p>
						</div>
						<div>
							<p className="text-xs text-muted-foreground">Row Limit</p>
							<p className="font-medium">{wizardState.limit || 100}</p>
						</div>
					</div>

					{/* Show selected fields as badges */}
					{wizardState.fields.length > 0 && (
						<div>
							<p className="mb-2 text-xs text-muted-foreground">
								Selected Fields
							</p>
							<div className="flex flex-wrap gap-1">
								{wizardState.fields.map((field) => (
									<Badge key={field.path} variant="secondary">
										{field.alias || field.path}
									</Badge>
								))}
							</div>
						</div>
					)}

					{/* Show grouping if configured */}
					{wizardState.groupBy.length > 0 && (
						<div>
							<p className="mb-2 text-xs text-muted-foreground">Grouped By</p>
							<div className="flex flex-wrap gap-1">
								{wizardState.groupBy.map((field) => (
									<Badge key={field} variant="outline">
										{field}
									</Badge>
								))}
							</div>
						</div>
					)}

					{/* Show sorting if configured */}
					{wizardState.sorting.length > 0 && (
						<div>
							<p className="mb-2 text-xs text-muted-foreground">Sorted By</p>
							<div className="flex flex-wrap gap-1">
								{wizardState.sorting.map((sort) => (
									<Badge key={sort.field} variant="outline">
										{sort.field} ({sort.direction})
									</Badge>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Preview Results */}
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-medium">Data Preview</h3>
						{previewData && (
							<p className="text-xs text-muted-foreground">
								Showing {previewData.rows.length} of {previewData.totalCount}{' '}
								rows ({previewData.executionTimeMs}ms)
							</p>
						)}
					</div>

					{isLoading ? (
						<div className="flex items-center justify-center rounded-lg border p-8">
							<Loader2 className="mr-2 h-5 w-5 animate-spin" />
							<span className="text-sm text-muted-foreground">
								Loading preview...
							</span>
						</div>
					) : error ? (
						<div className="rounded-lg border border-destructive bg-destructive/10 p-4">
							<p className="text-sm text-destructive">{error}</p>
						</div>
					) : previewData && previewData.rows.length > 0 ? (
						<div className="rounded-lg border">
							<div className="max-h-[400px] overflow-auto">
								<Table>
									<TableHeader>
										<TableRow>
											{previewData.columns.map((col) => (
												<TableHead key={col.key} className="whitespace-nowrap">
													{col.label}
												</TableHead>
											))}
										</TableRow>
									</TableHeader>
									<TableBody>
										{previewData.rows.map((row, rowIndex) => (
											<TableRow key={rowIndex}>
												{previewData.columns.map((col) => (
													<TableCell
														key={col.key}
														className="max-w-[200px] truncate"
													>
														{String(row[col.key] ?? '')}
													</TableCell>
												))}
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</div>
					) : previewData ? (
						<div className="rounded-lg border border-dashed p-8 text-center">
							<p className="text-sm text-muted-foreground">
								No data matches your criteria.
							</p>
						</div>
					) : (
						<div className="rounded-lg border border-dashed p-8 text-center">
							<p className="text-sm text-muted-foreground">
								Preview will appear here when you complete the configuration.
							</p>
						</div>
					)}
				</div>
			</div>
		</WizardStepContent>
	)
}
