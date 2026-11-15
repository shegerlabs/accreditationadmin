import { Link, useLocation } from '@remix-run/react'
import { ClipboardList, PrinterIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { type PartCard, type SelectedBox } from '~/utils/boxes'

/** The box page as it is now, so a dialog's Close/Cancel comes back to it. */
function useBack() {
	const { pathname, search } = useLocation()
	return `${pathname}${search}`
}

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
	const back = useBack()
	const ready = part ? part.readyPeople : box.readyPeople
	const waiting = part ? part.waiting : box.waiting
	// A split box is packed per smaller box; each card has its own button.
	if (!part && box.parts) return null
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
		const sp = new URLSearchParams({ part: part.key, back })
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
	sp.set('back', back)
	return (
		<Button size={size} variant={waiting === 0 ? 'default' : 'outline'} asChild>
			<Link to={`/printer/boxes/${box.id}/print?${sp}`}>{label}</Link>
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
	const back = useBack()
	const sp = new URLSearchParams()
	if (box.part) sp.set('part', box.part.key)
	sp.set('only', ids.join(','))
	sp.set('back', back)
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

/**
 * Opens the label and packing list for the open box or smaller box, or for
 * every smaller box when the box is split and none is open.
 */
export function BoxSheetButton({
	box,
	part,
	size = 'sm',
}: {
	box: SelectedBox
	part?: PartCard
	size?: 'sm' | 'default'
}) {
	const back = useBack()
	const partKey = part?.key ?? box.part?.key ?? null
	const sp = new URLSearchParams()
	if (partKey) sp.set('part', partKey)
	sp.set('back', back)
	const to = `/printer/boxes/${box.id}/manifest?${sp}`
	if (part) {
		const label = 'Label and packing list'
		return (
			<Button size="sm" variant="outline" className="h-7 px-2" asChild>
				<Link to={to} title={label} aria-label={label}>
					<ClipboardList className="size-3.5" aria-hidden />
				</Link>
			</Button>
		)
	}
	const all = !box.part && box.parts ? box.parts.length : 0
	return (
		<Button size={size} variant="outline" asChild>
			<Link to={to}>
				<ClipboardList className="mr-2 size-4" aria-hidden />
				{all > 1 ? `Box sheets for all ${all}` : 'Box sheet'}
			</Link>
		</Button>
	)
}
