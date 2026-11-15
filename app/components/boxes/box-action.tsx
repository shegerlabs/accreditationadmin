import { Link } from '@remix-run/react'
import { PrinterIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { type PartCard, type SelectedBox } from '~/utils/boxes'

/** Opens the batch print page for a box or one of its smaller boxes. */
export function PrintBoxButton({
	box,
	part,
	size = 'sm',
}: {
	box: SelectedBox
	/** A smaller box's card; otherwise the open box (or open smaller box). */
	part?: PartCard
	size?: 'sm' | 'default'
}) {
	const ready = part ? part.readyPeople : box.readyPeople
	const waiting = part ? part.waiting : box.waiting
	const partKey = part?.key ?? box.part?.key ?? null
	const label =
		ready.length === 0
			? waiting === 0
				? 'Nothing ready to print'
				: 'None ready to print yet'
			: waiting === 0
				? 'Send box to printer'
				: `Print ${ready.length} ready`

	// Part cards sit in a grid; a full label would make every header tall.
	if (part) {
		const content = (
			<>
				<PrinterIcon className="size-3.5" aria-hidden />
				<span className="tabular-nums">{ready.length}</span>
			</>
		)
		const className = 'h-7 gap-1.5 px-2'
		if (ready.length === 0)
			return (
				<Button
					size="sm"
					variant="outline"
					className={className}
					disabled
					title={label}
					aria-label={label}
				>
					{content}
				</Button>
			)
		const sp = new URLSearchParams({ part: part.key })
		return (
			<Button
				size="sm"
				variant={waiting === 0 ? 'default' : 'outline'}
				className={className}
				asChild
			>
				<Link
					to={`/printer/boxes/${box.id}/print?${sp}`}
					title={label}
					aria-label={label}
				>
					{content}
				</Link>
			</Button>
		)
	}

	if (ready.length === 0)
		return (
			<Button size={size} variant="outline" disabled>
				{label}
			</Button>
		)

	const sp = new URLSearchParams()
	if (partKey) sp.set('part', partKey)
	return (
		<Button size={size} variant={waiting === 0 ? 'default' : 'outline'} asChild>
			<Link to={`/printer/boxes/${box.id}/print${sp.size ? `?${sp}` : ''}`}>
				{label}
			</Link>
		</Button>
	)
}

/** Opens the print page for just the people ticked in the open box. */
export function PrintSelectedButtons({
	box,
	ids,
	clear,
}: {
	box: SelectedBox
	ids: string[]
	clear: () => void
}) {
	const sp = new URLSearchParams()
	if (box.part) sp.set('part', box.part.key)
	sp.set('only', ids.join(','))
	return (
		<>
			<Button size="sm" variant="ghost" onClick={clear}>
				Clear
			</Button>
			<Button size="sm" asChild>
				<Link to={`/printer/boxes/${box.id}/print?${sp}`} preventScrollReset>
					Print {ids.length} selected
				</Link>
			</Button>
		</>
	)
}
