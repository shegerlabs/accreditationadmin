import { Check, ChevronDown, Search } from 'lucide-react'
import * as React from 'react'
import { cn } from '~/utils/misc'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export type SearchableOption = {
	value: string
	label: string
	/** Smaller text after the label, also searched. */
	hint?: string
	/** Options with the same group are listed under it. */
	group?: string
}

/**
 * A select with a search box, styled like SelectTrigger. Submits with its form
 * through a hidden input named `name`; onValueChange runs after that input
 * holds the new value, so it can submit the form.
 */
export function SearchableSelect({
	name,
	value: initial,
	options,
	placeholder = 'Choose…',
	searchPlaceholder = 'Search…',
	emptyText = 'Nothing matches.',
	onValueChange,
	className,
	'aria-label': ariaLabel,
	id,
}: {
	name: string
	value?: string | null
	options: SearchableOption[]
	placeholder?: string
	searchPlaceholder?: string
	emptyText?: string
	onValueChange?: (value: string, input: HTMLInputElement) => void
	className?: string
	'aria-label'?: string
	id?: string
}) {
	const [open, setOpen] = React.useState(false)
	const [value, setValue] = React.useState(initial ?? '')
	const [query, setQuery] = React.useState('')
	const [active, setActive] = React.useState(0)
	const inputRef = React.useRef<HTMLInputElement>(null)
	const listRef = React.useRef<HTMLUListElement>(null)
	const searchRef = React.useRef<HTMLInputElement>(null)
	const listId = React.useId()

	React.useEffect(() => setValue(initial ?? ''), [initial])

	const q = query.trim().toLowerCase()
	const shown = q
		? options.filter(o =>
				[o.label, o.hint, o.group].some(v => v?.toLowerCase().includes(q)),
			)
		: options
	const selected = options.find(o => o.value === value)

	const choose = (o: SearchableOption) => {
		setValue(o.value)
		setOpen(false)
		const input = inputRef.current
		if (input) {
			input.value = o.value
			onValueChange?.(o.value, input)
		}
	}

	React.useEffect(() => {
		listRef.current
			?.querySelector(`[data-index="${active}"]`)
			?.scrollIntoView({ block: 'nearest' })
	}, [active])

	let lastGroup: string | undefined
	return (
		<>
			<input ref={inputRef} type="hidden" name={name} defaultValue={value} />
			<Popover
				open={open}
				onOpenChange={o => {
					setOpen(o)
					if (o) {
						setQuery('')
						setActive(Math.max(0, options.indexOf(selected!)))
					}
				}}
			>
				<PopoverTrigger asChild>
					<button
						type="button"
						id={id}
						role="combobox"
						aria-expanded={open}
						aria-controls={listId}
						aria-label={ariaLabel}
						className={cn(
							'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
							className,
						)}
					>
						<span
							className={cn('truncate', !selected && 'text-muted-foreground')}
						>
							{selected ? selected.label : placeholder}
						</span>
						<ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
					</button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-0"
					onOpenAutoFocus={e => {
						e.preventDefault()
						searchRef.current?.focus()
					}}
				>
					<div className="flex items-center gap-2 border-b px-3">
						<Search className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
						<input
							ref={searchRef}
							value={query}
							onChange={e => {
								setQuery(e.target.value)
								setActive(0)
							}}
							onKeyDown={e => {
								if (e.key === 'ArrowDown') {
									e.preventDefault()
									setActive(a => Math.min(a + 1, shown.length - 1))
								} else if (e.key === 'ArrowUp') {
									e.preventDefault()
									setActive(a => Math.max(a - 1, 0))
								} else if (e.key === 'Enter') {
									e.preventDefault()
									const o = shown[active]
									if (o) choose(o)
								}
							}}
							placeholder={searchPlaceholder}
							aria-label={searchPlaceholder}
							aria-controls={listId}
							aria-activedescendant={
								shown[active] ? `${listId}-${active}` : undefined
							}
							className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
						/>
					</div>
					<ul
						ref={listRef}
						id={listId}
						role="listbox"
						className="max-h-72 overflow-y-auto p-1"
					>
						{shown.length === 0 && (
							<li className="px-2 py-6 text-center text-sm text-muted-foreground">
								{emptyText}
							</li>
						)}
						{shown.map((o, n) => {
							const header =
								o.group && o.group !== lastGroup ? o.group : undefined
							lastGroup = o.group
							return (
								<React.Fragment key={o.value}>
									{header && (
										<li
											role="presentation"
											className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground"
										>
											{header}
										</li>
									)}
									{/* The search box drives the keyboard (aria-activedescendant). */}
									{/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
									<li
										id={`${listId}-${n}`}
										data-index={n}
										role="option"
										aria-selected={o.value === value}
										onMouseEnter={() => setActive(n)}
										onMouseDown={e => e.preventDefault()}
										onClick={() => choose(o)}
										className={cn(
											'relative flex cursor-default select-none items-start rounded-sm py-1.5 pl-8 pr-2 text-sm',
											n === active && 'bg-accent text-accent-foreground',
										)}
									>
										<span className="absolute left-2 top-2 flex h-3.5 w-3.5 items-center justify-center">
											{o.value === value && <Check className="h-4 w-4" />}
										</span>
										<span className="min-w-0">
											{o.label}
											{o.hint && (
												<span className="block text-xs text-muted-foreground">
													{o.hint}
												</span>
											)}
										</span>
									</li>
								</React.Fragment>
							)
						})}
					</ul>
				</PopoverContent>
			</Popover>
		</>
	)
}
