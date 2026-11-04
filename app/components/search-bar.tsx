import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { IconName } from '@/icon-name'
import { Form, Link, useSearchParams, useSubmit } from '@remix-run/react'
import { ChevronDown, Filter, PlusCircle } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { useDebounce, useIsPending } from '~/utils/misc'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Icon } from './ui/icon'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from './ui/select'
import { StatusButton } from './ui/status-button'

type ExtraLink = {
	type?: 'link' | 'anchor'
	label: string
	to: string
	icon?: IconName
}

type ExtraDropdown = {
	type: 'dropdown'
	label: string
	icon?: IconName
	items: Array<{
		label: string
		to: string
		icon?: IconName
	}>
}

export function SearchBar({
	status,
	autoSubmit = false,
	action,
	filters,
	showAddButton = true,
	extras,
	renderExtra,
	filterDisplay = 'inline',
}: {
	status: 'idle' | 'pending' | 'success' | 'error'
	autoSubmit?: boolean
	action: string
	showAddButton?: boolean
	filters?: Array<{
		name: string
		label: string
		type: 'select' | 'input' | 'date'
		options?: Array<{ value: string; label: string }>
		defaultValue?: string
		show?: boolean
	}>
	extras?: Array<ExtraLink | ExtraDropdown>
	renderExtra?: React.ReactNode
	filterDisplay?: 'inline' | 'popover'
}) {
	const id = useId()
	const [searchParams] = useSearchParams()
	const submit = useSubmit()
	const popoverFormRef = useRef<HTMLFormElement>(null)
	const [popoverOpen, setPopoverOpen] = useState(false)
	const isSubmitting = useIsPending({
		formMethod: 'GET',
		formAction: action,
	})

	// Filter out filters where show === false
	const visibleFilters = filters?.filter(filter => filter.show !== false)

	// Handler that merges form data with existing search params
	const handleFormChange = useDebounce((form: HTMLFormElement) => {
		const formData = new FormData(form)
		// Start with existing search params to preserve other values
		const mergedParams = new URLSearchParams(searchParams)

		for (const [key, value] of formData.entries()) {
			if (typeof value === 'string') {
				if (value.trim() !== '' && value !== 'all') {
					mergedParams.set(key, value)
				} else {
					// Remove the param if value is empty or 'all'
					mergedParams.delete(key)
				}
			}
		}

		submit(mergedParams, { method: 'GET', action })
	}, 400)

	// Handler for popover form changes (auto-submit)
	const handlePopoverFormChange = useDebounce((form: HTMLFormElement) => {
		const formData = new FormData(form)
		// Start with existing search params to preserve other values
		const mergedParams = new URLSearchParams(searchParams)

		for (const [key, value] of formData.entries()) {
			if (typeof value === 'string') {
				if (value.trim() !== '' && value !== 'all') {
					mergedParams.set(key, value)
				} else {
					// Remove the param if value is empty or 'all'
					mergedParams.delete(key)
				}
			}
		}

		submit(mergedParams, { method: 'GET', action })
	}, 400)

	// Calculate active filter count (excluding 'all' values and empty values)
	const activeFilterCount =
		visibleFilters?.filter(filter => {
			const value = searchParams.get(filter.name)
			return value && value !== 'all' && value !== '' && value !== 'false'
		}).length ?? 0

	// Build default values from search params for the popover form
	const popoverDefaultValues: Record<string, string> = {
		search: searchParams.get('search') ?? '',
	}
	visibleFilters?.forEach(filter => {
		popoverDefaultValues[filter.name] =
			searchParams.get(filter.name) || filter.defaultValue || ''
	})

	// Create a dynamic schema for the popover form
	const popoverSchema = z.object({
		search: z.string().optional(),
		...Object.fromEntries(
			visibleFilters?.map(filter => [filter.name, z.string().optional()]) ?? [],
		),
	})

	const [popoverForm, popoverFields] = useForm({
		id: 'filter-popover-form',
		constraint: getZodConstraint(popoverSchema),
		defaultValue: popoverDefaultValues,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: popoverSchema })
		},
	})

	// Render filter fields for inline mode (original behavior)
	const renderFilters = () =>
		visibleFilters?.map(filter => {
			const defaultValue =
				searchParams.get(filter.name) || filter.defaultValue || ''

			return (
				<div key={filter.name} className="min-w-[140px]">
					{filter.type === 'select' ? (
						<Select name={filter.name} defaultValue={defaultValue}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder={filter.label} />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectLabel>{filter.label}</SelectLabel>
									{filter.options?.map(option => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					) : filter.type === 'date' ? (
						<Input
							type="date"
							name={filter.name}
							id={filter.name}
							defaultValue={defaultValue}
							className="w-full"
							title={filter.label}
						/>
					) : (
						<Input
							type="text"
							name={filter.name}
							id={filter.name}
							placeholder={filter.label}
							defaultValue={defaultValue}
							className="w-full"
						/>
					)}
				</div>
			)
		})

	return (
		<div className="flex-1">
			<Form
				method="GET"
				action={action}
				className="flex flex-wrap items-center gap-2"
				onChange={e => autoSubmit && handleFormChange(e.currentTarget)}
			>
				{filterDisplay === 'inline' && renderFilters()}

				{/* When using popover, preserve filter values when searching (only non-empty values) */}
				{filterDisplay === 'popover' &&
					visibleFilters?.map(filter => {
						const value = searchParams.get(filter.name)
						// Only render hidden input if there's an actual value (not empty, not 'all')
						if (!value || value === 'all' || value === '') return null
						return (
							<input
								key={filter.name}
								type="hidden"
								name={filter.name}
								value={value}
							/>
						)
					})}

				{filterDisplay === 'popover' && visibleFilters && visibleFilters.length > 0 && (
					<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="gap-2"
							>
								<Filter className="h-4 w-4" />
								Filters
								{activeFilterCount > 0 && (
									<Badge
										variant="secondary"
										className="ml-1 h-5 min-w-[20px] rounded-full px-1.5 text-xs"
									>
										{activeFilterCount}
									</Badge>
								)}
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-80" align="start">
							<Form
								ref={popoverFormRef}
								method="GET"
								action={action}
								{...getFormProps(popoverForm)}
								className="space-y-4"
								onChange={e => autoSubmit && handlePopoverFormChange(e.currentTarget)}
								onSubmit={e => {
									e.preventDefault()
									if (popoverFormRef.current) {
										handlePopoverFormChange(popoverFormRef.current)
									}
									setPopoverOpen(false)
								}}
							>
								<div className="flex items-center justify-between">
									<div className="font-medium">Filters</div>
									{activeFilterCount > 0 && (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
											onClick={() => {
												// Keep only the search param if it exists
												const searchValue = searchParams.get('search')
												const newParams = new URLSearchParams()
												if (searchValue) {
													newParams.set('search', searchValue)
												}
												submit(newParams, { method: 'GET', action })
												setPopoverOpen(false)
											}}
										>
											Clear all
										</Button>
									)}
								</div>
								<div className="space-y-3">
									{visibleFilters?.map(filter => {
										const field = popoverFields[filter.name]
										if (!field) return null

										return (
											<div key={filter.name} className="w-full">
												<Label className="mb-1.5 block text-sm font-medium">
													{filter.label}
												</Label>
												{filter.type === 'select' ? (
													<SelectField
														meta={field}
														items={
															filter.options?.map(opt => ({
																name: opt.label,
																value: opt.value,
															})) ?? []
														}
														placeholder={filter.label}
														onValueChange={() => {
															if (autoSubmit && popoverFormRef.current) {
																// Small delay to allow the hidden select to update
																setTimeout(() => {
																	if (popoverFormRef.current) {
																		handlePopoverFormChange(popoverFormRef.current)
																	}
																}, 0)
															}
														}}
													/>
												) : filter.type === 'date' ? (
													<InputField
														meta={field}
														type="date"
														className="w-full"
													/>
												) : (
													<InputField
														meta={field}
														type="text"
														placeholder={filter.label}
														className="w-full"
													/>
												)}
											</div>
										)
									})}
								</div>
								{!autoSubmit && (
									<Button type="submit" size="sm" className="w-full">
										Apply Filters
									</Button>
								)}
							</Form>
						</PopoverContent>
					</Popover>
				)}

				<div className="min-w-0 flex-[1_1_200px]">
					<Label htmlFor={id} className="sr-only">
						Search
					</Label>
					<Input
						type="search"
						name="search"
						id={id}
						defaultValue={searchParams.get('search') ?? ''}
						placeholder="Search"
						className="w-full"
					/>
				</div>
				<StatusButton
					type="submit"
					status={isSubmitting ? 'pending' : status}
					className="flex items-center justify-center"
					size="sm"
				>
					<Icon name="magnifying-glass" size="sm" />
					<span className="sr-only">Search</span>
				</StatusButton>
				{showAddButton && (
					<Button asChild size="sm" className="gap-1">
						<Link to="new">
							<PlusCircle className="h-4 w-4" />
							Add
						</Link>
					</Button>
				)}
				{extras?.map(extra =>
					extra.type === 'dropdown' ? (
						<DropdownMenu key={extra.label}>
							<DropdownMenuTrigger asChild>
								<Button size="sm" className="gap-1">
									{extra.icon && <Icon name={extra.icon} size="sm" />}
									{extra.label}
									<ChevronDown className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{extra.items.map(item => (
									<DropdownMenuItem key={item.label} asChild>
										<Link
											to={item.to}
											className="flex items-center gap-2"
										>
											{item.icon && <Icon name={item.icon} size="sm" />}
											{item.label}
										</Link>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					) : (
						<Button key={extra.label} asChild size="sm">
							{extra.type === 'anchor' ? (
								<a
									href={`${extra.to}${searchParams.size ? '?' + searchParams.toString() : ''}`}
									className="gap-1"
								>
									{extra.icon && <Icon name={extra.icon} size="sm" />}
									{extra.label}
								</a>
							) : (
								<Link to={extra.to} className="gap-1">
									{extra.icon && <Icon name={extra.icon} size="sm" />}
									{extra.label}
								</Link>
							)}
						</Button>
					),
				)}
				{renderExtra}
			</Form>
		</div>
	)
}
