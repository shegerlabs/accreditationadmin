import { useFetcher, useLocation, useParams } from '@remix-run/react'
import type { BoxSplit } from '@prisma/client'
import {
	Archive,
	ArchiveRestore,
	ArrowDown,
	ArrowUp,
	Check,
	LockOpen,
	Pencil,
	Plus,
	Search,
	Trash2,
	X,
} from 'lucide-react'
import * as React from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import {
	isCatchAll,
	CAPPABLE,
	SPLIT_LABEL,
	SPLITS,
	type MemberRow,
	type SelectedBox,
} from '~/utils/boxes'
import { cn } from '~/utils/misc'
import { Initials, personName } from './stage'

export type TypeCount = {
	id: string
	name: string
	total: number
	/** Of those, accredited for the closed session. */
	closed: number
}

// Radix Select can't hold an empty value; this stands in for "no split".
const NO_SPLIT = 'none'

/** Posts back to the boxes page, keeping the open box and smaller box. */
function useHere() {
	const location = useLocation()
	return location.pathname + location.search
}

/** Closes a dialog once its fetcher finishes without an error. */
function useCloseOnSuccess(
	fetcher: { state: string; data?: { error?: string } },
	close: () => void,
) {
	const wasBusy = React.useRef(false)
	const busy = fetcher.state !== 'idle'
	React.useEffect(() => {
		if (busy) wasBusy.current = true
		else if (wasBusy.current) {
			wasBusy.current = false
			if (!fetcher.data?.error) close()
		}
	}, [busy, fetcher.data, close])
	return busy
}

function Hidden({ fields }: { fields: Record<string, string> }) {
	return (
		<>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			{Object.entries(fields).map(([k, v]) => (
				<input key={k} type="hidden" name={k} value={v} />
			))}
		</>
	)
}

function FormError({ error }: { error?: string }) {
	if (!error) return null
	return (
		<p
			className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900"
			role="alert"
		>
			{error}
		</p>
	)
}

type Draft = {
	name: string
	hasRule: boolean
	participantTypeIds: string[]
	closedSessionOnly: boolean
	splitBy: BoxSplit | null
	batchSize: number
	/** Text, so the field can be empty (no limit). */
	maxPerBox: string
}

function draftOf(box?: SelectedBox): Draft {
	return box
		? {
				name: box.name,
				hasRule: box.hasRule,
				participantTypeIds: box.participantTypeIds,
				closedSessionOnly: box.closedSessionOnly,
				splitBy: box.splitBy,
				batchSize: box.batchSize,
				maxPerBox: box.maxPerBox ? String(box.maxPerBox) : '',
			}
		: {
				name: '',
				hasRule: true,
				participantTypeIds: [],
				closedSessionOnly: false,
				splitBy: null,
				batchSize: 25,
				maxPerBox: '',
			}
}

/**
 * Move a box up or down the list. Order decides where people go: each person
 * is in the first box whose rule they match.
 */
export function MoveBoxButtons({
	boxId,
	name,
	first,
	last,
}: {
	boxId: string
	name: string
	first: boolean
	last: boolean
}) {
	const fetcher = useFetcher()
	const here = useHere()
	const busy = fetcher.state !== 'idle'
	if (first && last) return null
	return (
		<fetcher.Form method="POST" action={here} className="flex shrink-0">
			<Hidden fields={{ intent: 'move', boxId }} />
			<Button
				type="submit"
				name="direction"
				value="up"
				size="icon"
				variant="ghost"
				className="h-8 w-8"
				disabled={busy || first}
				aria-label={`Move ${name} up`}
				title="Move up"
			>
				<ArrowUp className="h-4 w-4" />
			</Button>
			<Button
				type="submit"
				name="direction"
				value="down"
				size="icon"
				variant="ghost"
				className="h-8 w-8"
				disabled={busy || last}
				aria-label={`Move ${name} down`}
				title="Move down"
			>
				<ArrowDown className="h-4 w-4" />
			</Button>
		</fetcher.Form>
	)
}

/** "New box" in the sidebar, or "Edit" on an open box. */
export function BoxEditorButton({
	types,
	box,
}: {
	types: TypeCount[]
	box?: SelectedBox
}) {
	const [open, setOpen] = React.useState(false)
	return (
		<>
			<Button size="sm" variant="outline" onClick={() => setOpen(true)}>
				{box ? (
					<Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
				) : (
					<Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
				)}
				{box ? 'Edit' : 'New box'}
			</Button>
			{open && (
				<BoxEditorDialog
					types={types}
					box={box}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	)
}

function BoxEditorDialog({
	types,
	box,
	onClose,
}: {
	types: TypeCount[]
	box?: SelectedBox
	onClose: () => void
}) {
	const fetcher = useFetcher<{ error?: string }>()
	const busy = useCloseOnSuccess(fetcher, onClose)
	const here = useHere()
	const [d, setD] = React.useState(() => draftOf(box))
	const set = (patch: Partial<Draft>) => setD(prev => ({ ...prev, ...patch }))

	const catchAll = isCatchAll(d)
	const pool = d.participantTypeIds.length
		? types.filter(t => d.participantTypeIds.includes(t.id))
		: types
	const matches = pool.reduce(
		(n, t) => n + (d.closedSessionOnly ? t.closed : t.total),
		0,
	)
	const cappable = !!d.splitBy && CAPPABLE.includes(d.splitBy)
	const cap = cappable && d.maxPerBox ? Number(d.maxPerBox) : null
	const capValid = cap === null || (Number.isInteger(cap) && cap >= 1)
	// Adding or dropping a limit re-files locked badges, as a new split does.
	const refiles =
		!!box &&
		box.lockedInBox > 0 &&
		(d.splitBy !== box.splitBy ||
			(cappable && (cap === null) !== (box.maxPerBox === null)))
	const canSave = d.name.trim().length > 0 && d.batchSize >= 1 && capValid

	return (
		<Dialog open onOpenChange={o => !o && !busy && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{box ? 'Edit box' : 'New box'}</DialogTitle>
					<DialogDescription>
						Start from a rule, from nobody, or both. You can add people or leave
						them out by hand at any time.
					</DialogDescription>
				</DialogHeader>
				<fetcher.Form
					method="POST"
					action={here}
					id="box-editor"
					className="space-y-5"
				>
					<Hidden
						fields={{
							intent: 'save',
							hasRule: String(d.hasRule),
							...(box ? { id: box.id } : {}),
						}}
					/>
					{d.hasRule &&
						d.participantTypeIds.map(id => (
							<input
								key={id}
								type="hidden"
								name="participantTypeIds"
								value={id}
							/>
						))}

					<div className="space-y-1.5">
						<Label htmlFor="box-name">Name</Label>
						<Input
							id="box-name"
							name="name"
							required
							maxLength={100}
							autoComplete="off"
							className="text-base sm:text-sm"
							placeholder="e.g. Speakers of Parliament"
							value={d.name}
							onChange={e => set({ name: e.target.value })}
						/>
					</div>

					<fieldset className="space-y-2">
						<legend className="text-sm font-medium">Who goes in</legend>
						<div className="grid grid-cols-2 gap-2">
							{[
								{
									v: true,
									label: 'Everyone matching a rule',
									hint: 'Fills itself as people register',
								},
								{
									v: false,
									label: 'Only people I pick',
									hint: 'Add them one by one after saving',
								},
							].map(o => (
								<button
									type="button"
									key={String(o.v)}
									aria-pressed={d.hasRule === o.v}
									onClick={() => set({ hasRule: o.v })}
									className={cn(
										'rounded-md border p-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
										d.hasRule === o.v && 'border-primary ring-1 ring-primary',
									)}
								>
									<span className="block font-medium">{o.label}</span>
									<span className="block text-xs text-muted-foreground">
										{o.hint}
									</span>
								</button>
							))}
						</div>
					</fieldset>

					{d.hasRule && (
						<>
							<fieldset className="space-y-2">
								<legend className="text-sm font-medium">
									Participant types
								</legend>
								<p className="text-xs text-muted-foreground">
									Tick none to take every type. A person goes in the first box
									in the list whose rule they match.
								</p>
								{types.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										This event has no participant types yet.
									</p>
								) : (
									<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
										{types.map(t => (
											<label
												key={t.id}
												className="flex items-center gap-2 text-sm"
											>
												<Checkbox
													checked={d.participantTypeIds.includes(t.id)}
													onCheckedChange={c =>
														set({
															participantTypeIds: c
																? [...d.participantTypeIds, t.id]
																: d.participantTypeIds.filter(x => x !== t.id),
														})
													}
												/>
												<span className="min-w-0 flex-1 truncate">
													{t.name}
												</span>
												<span className="text-xs tabular-nums text-muted-foreground">
													{t.total}
												</span>
											</label>
										))}
									</div>
								)}
							</fieldset>
							<div className="flex items-start gap-2 text-sm">
								<Checkbox
									id="box-closed"
									name="closedSessionOnly"
									className="mt-0.5"
									checked={d.closedSessionOnly}
									onCheckedChange={c => set({ closedSessionOnly: c === true })}
								/>
								<Label htmlFor="box-closed" className="font-normal">
									<span className="block font-medium">Closed session only</span>
									<span className="block text-xs text-muted-foreground">
										Only participants accredited for the closed session
									</span>
								</Label>
							</div>
						</>
					)}

					<div className="grid gap-4 sm:grid-cols-[1fr_auto]">
						<div className="space-y-1.5">
							<Label htmlFor="box-split">Split into smaller boxes by</Label>
							<input type="hidden" name="splitBy" value={d.splitBy ?? ''} />
							<Select
								value={d.splitBy ?? NO_SPLIT}
								onValueChange={v =>
									set({ splitBy: v === NO_SPLIT ? null : (v as BoxSplit) })
								}
							>
								<SelectTrigger id="box-split">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NO_SPLIT}>Don’t split</SelectItem>
									{(box?.splitBy && !SPLITS.includes(box.splitBy)
										? [box.splitBy, ...SPLITS]
										: SPLITS
									).map(s => (
										<SelectItem key={s} value={s}>
											{SPLIT_LABEL[s]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{d.splitBy === 'SIZE' && (
							<div className="space-y-1.5">
								<Label htmlFor="box-batch">People per box</Label>
								<Input
									id="box-batch"
									name="batchSize"
									type="number"
									inputMode="numeric"
									min={1}
									max={500}
									className="w-32 text-base tabular-nums sm:text-sm"
									value={d.batchSize}
									onChange={e =>
										set({ batchSize: Math.max(1, Number(e.target.value) || 1) })
									}
								/>
							</div>
						)}
						{cappable && (
							<div className="space-y-1.5">
								<Label htmlFor="box-cap">At most per box</Label>
								<Input
									id="box-cap"
									name="maxPerBox"
									type="number"
									inputMode="numeric"
									min={1}
									max={500}
									placeholder="No limit"
									className="w-32 text-base tabular-nums sm:text-sm"
									value={d.maxPerBox}
									onChange={e => set({ maxPerBox: e.target.value })}
								/>
							</div>
						)}
					</div>
					{cappable && (
						<p className="-mt-3 text-xs text-muted-foreground">
							{cap
								? `A ${d.splitBy === 'TYPE' ? 'type' : 'surname range'} with more than ${cap} people is cut into numbered batches in surname order. A batch locks once any of it is printed.`
								: 'Leave empty for one smaller box per group, however big.'}
						</p>
					)}
					{d.splitBy === 'SIZE' && (
						<p className="-mt-3 text-xs text-muted-foreground">
							Batches are cut in surname order. A batch locks once any of it is
							printed.
						</p>
					)}
					{box && refiles && (
						<p className="rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-900">
							{box.lockedInBox}{' '}
							{box.lockedInBox === 1 ? 'badge is' : 'badges are'} locked to this
							box. {box.lockedInBox === 1 ? 'It' : 'They'} will be re-filed
							under the new split
							{d.splitBy === 'SIZE' || cap ? ', in batches of their own' : ''}.
							Re-sort the physical badges to match.
						</p>
					)}
					{d.splitBy !== 'SIZE' && (
						<input type="hidden" name="batchSize" value={d.batchSize} />
					)}

					<FormError error={fetcher.data?.error} />
				</fetcher.Form>
				<DialogFooter className="items-center gap-2 sm:justify-between">
					<span className="text-sm tabular-nums text-muted-foreground">
						{!d.hasRule
							? 'People are added by hand'
							: catchAll
								? 'Takes everyone not in a box above'
								: `${matches} ${matches === 1 ? 'participant matches' : 'participants match'} the rule`}
					</span>
					<div className="flex gap-2">
						<Button variant="outline" onClick={onClose} disabled={busy}>
							Cancel
						</Button>
						<Button type="submit" form="box-editor" disabled={!canSave || busy}>
							{busy ? 'Saving…' : box ? 'Save' : 'Create box'}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

/** The open smaller box, or the whole box. */
function scopeName(box: SelectedBox) {
	if (!box.part) return box.name
	const { batch, label } = box.part
	return `${box.name} › ${batch ? `Box ${batch.index} of ${batch.of}` : label}`
}

const badges = (n: number) => `${n} ${n === 1 ? 'badge' : 'badges'}`

/**
 * Archive the printed badges in the open box (or smaller box), or undo it.
 * Archiving is bookkeeping: archived badges still pass the checkpoint and can
 * still be reprinted.
 */
export function ArchiveBoxButtons({ box }: { box: SelectedBox }) {
	const printed = box.stages.printed
	const archived = box.stages.archived
	const notPrinted = box.total - printed - archived
	return (
		<>
			{printed > 0 && (
				<ArchiveDialog
					box={box}
					intent="archive"
					trigger={
						<>
							<Archive className="mr-1.5 h-4 w-4" aria-hidden="true" />
							Archive {printed} printed
						</>
					}
					title={`Archive ${badges(printed)}?`}
					description={
						<>
							{scopeName(box)}. Their status changes to Archived. The badges
							stay valid: they still pass the checkpoint, and printers can still
							reprint them.
							{notPrinted > 0 &&
								` ${notPrinted} not printed yet ${notPrinted === 1 ? 'is' : 'are'} left as ${notPrinted === 1 ? 'it is' : 'they are'}; archive the box again once they’re printed.`}
						</>
					}
					submit="Archive"
					busyLabel="Archiving…"
				/>
			)}
			{archived > 0 && (
				<ArchiveDialog
					box={box}
					intent="unarchive"
					trigger={
						<>
							<ArchiveRestore className="mr-1.5 h-4 w-4" aria-hidden="true" />
							Unarchive
						</>
					}
					title={`Unarchive ${badges(archived)}?`}
					description={
						<>{scopeName(box)}. Their status goes back to Printed.</>
					}
					submit="Unarchive"
					busyLabel="Unarchiving…"
				/>
			)}
		</>
	)
}

function ArchiveDialog({
	box,
	intent,
	trigger,
	title,
	description,
	submit,
	busyLabel,
}: {
	box: SelectedBox
	intent: 'archive' | 'unarchive'
	trigger: React.ReactNode
	title: string
	description: React.ReactNode
	submit: string
	busyLabel: string
}) {
	const [open, setOpen] = React.useState(false)
	const fetcher = useFetcher<{ error?: string }>()
	const here = useHere()
	const close = React.useCallback(() => setOpen(false), [])
	const busy = useCloseOnSuccess(fetcher, close)
	const formId = `${intent}-box-${box.id}`
	return (
		<>
			<Button size="sm" variant="outline" onClick={() => setOpen(true)}>
				{trigger}
			</Button>
			<Dialog open={open} onOpenChange={o => !busy && setOpen(o)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription className="break-words">
							{description}
						</DialogDescription>
					</DialogHeader>
					<fetcher.Form method="POST" action={here} id={formId}>
						<Hidden
							fields={{ intent, boxId: box.id, part: box.part?.key ?? '' }}
						/>
					</fetcher.Form>
					<FormError error={fetcher.data?.error} />
					<DialogFooter>
						<Button variant="outline" onClick={close} disabled={busy}>
							Cancel
						</Button>
						<Button type="submit" form={formId} disabled={busy}>
							{busy ? busyLabel : submit}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}

export function DeleteBoxButton({ box }: { box: SelectedBox }) {
	const [open, setOpen] = React.useState(false)
	const fetcher = useFetcher<{ error?: string }>()
	const here = useHere()
	const close = React.useCallback(() => setOpen(false), [])
	const busy = useCloseOnSuccess(fetcher, close)
	return (
		<>
			<Button size="sm" variant="outline" onClick={() => setOpen(true)}>
				<Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
				Delete
			</Button>
			<Dialog open={open} onOpenChange={o => !busy && setOpen(o)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Delete this box?</DialogTitle>
						<DialogDescription className="break-words">
							{box.name}. Participants aren’t affected. Badges printed through
							this box
							{box.lockedInBox ? ` (${box.lockedInBox})` : ''} are no longer
							locked to it.
						</DialogDescription>
					</DialogHeader>
					<fetcher.Form method="POST" action={here} id={`delete-box-${box.id}`}>
						<Hidden fields={{ intent: 'delete', boxId: box.id }} />
					</fetcher.Form>
					<FormError error={fetcher.data?.error} />
					<DialogFooter>
						<Button variant="outline" onClick={close} disabled={busy}>
							Cancel
						</Button>
						<Button
							type="submit"
							variant="destructive"
							form={`delete-box-${box.id}`}
							disabled={busy}
						>
							{busy ? 'Deleting…' : 'Delete box'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}

type SearchResult = {
	id: string
	firstName: string
	familyName: string
	code: string
	typeName: string
	invitationName: string
	/** The box they're in now; adding them here moves them. */
	inBox: string | null
	/** Their printed badge is in that box, so they can't be moved. */
	locked: boolean
}

export function AddPeopleButton({ box }: { box: SelectedBox }) {
	const [open, setOpen] = React.useState(false)
	return (
		<>
			<Button size="sm" variant="outline" onClick={() => setOpen(true)}>
				<Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
				Add people
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Add people</DialogTitle>
						<DialogDescription className="break-words">
							To {box.name}. They stay in the box even if they don’t match its
							rule. Anyone already in another box moves here.
						</DialogDescription>
					</DialogHeader>
					{open && <AddPeople box={box} />}
				</DialogContent>
			</Dialog>
		</>
	)
}

function AddPeople({ box }: { box: SelectedBox }) {
	const { eventId } = useParams()
	const search = useFetcher<{ q: string; results: SearchResult[] }>()
	const [q, setQ] = React.useState('')
	const load = search.load
	React.useEffect(() => {
		const needle = q.trim()
		if (needle.length < 2) return
		const t = setTimeout(() => {
			const sp = new URLSearchParams({ q: needle, box: box.id })
			load(`/admin/events/${eventId}/boxes/search?${sp}`)
		}, 250)
		return () => clearTimeout(t)
	}, [q, box.id, eventId, load])

	const needle = q.trim()
	const results =
		needle.length >= 2 && search.data?.q === needle ? search.data.results : null
	return (
		<div>
			<div className="relative">
				<Search
					className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				/>
				<Input
					type="search"
					aria-label="Search participants to add"
					placeholder="Name, code, email or invitation"
					autoComplete="off"
					className="pl-9 text-base sm:text-sm"
					value={q}
					onChange={e => setQ(e.target.value)}
				/>
			</div>
			<div className="mt-2 min-h-24" aria-live="polite">
				{needle.length < 2 ? (
					<p className="py-3 text-sm text-muted-foreground">
						Type at least two letters.
					</p>
				) : results === null ? (
					<p className="py-3 text-sm text-muted-foreground">Searching…</p>
				) : results.length === 0 ? (
					<p className="py-3 text-sm text-muted-foreground">
						Nobody outside this box matches “{needle}”.
					</p>
				) : (
					<ul className="divide-y">
						{results.map(p => (
							<AddResult key={p.id} boxId={box.id} person={p} />
						))}
					</ul>
				)}
			</div>
		</div>
	)
}

function AddResult({
	boxId,
	person: p,
}: {
	boxId: string
	person: SearchResult
}) {
	const fetcher = useFetcher<{ ok?: boolean; error?: string }>()
	const here = useHere()
	const added = fetcher.data?.ok === true
	const busy = fetcher.state !== 'idle'
	const error = fetcher.data?.error
	return (
		<li className="flex items-center gap-2.5 py-2">
			<Initials p={p} />
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">
					{personName(p)}
				</span>
				<span className="block truncate text-xs text-muted-foreground">
					{p.typeName} · {p.invitationName}
				</span>
				{error ? (
					<span className="block text-xs text-red-700" role="alert">
						{error}
					</span>
				) : p.inBox && !added ? (
					<span className="block truncate text-xs text-muted-foreground">
						{p.locked
							? `Badge is in ${p.inBox}. Unlock it there to move them.`
							: `In ${p.inBox}. Adding moves them here.`}
					</span>
				) : null}
			</span>
			<fetcher.Form method="POST" action={here}>
				<Hidden fields={{ intent: 'add-member', boxId, participantId: p.id }} />
				<Button
					type="submit"
					size="icon"
					variant="outline"
					className="h-8 w-8 shrink-0"
					disabled={busy || added || p.locked}
					aria-label={
						added
							? `${p.firstName} ${p.familyName} added`
							: `Add ${p.firstName} ${p.familyName}`
					}
				>
					{added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
				</Button>
			</fetcher.Form>
		</li>
	)
}

/** Unlock a printed badge from this box, or take the person out of it. */
export function MemberRowActions({
	box,
	member: m,
}: {
	box: SelectedBox
	member: MemberRow
}) {
	const fetcher = useFetcher()
	const here = useHere()
	const busy = fetcher.state !== 'idle'
	const name = `${m.firstName} ${m.familyName}`
	return (
		<div className="flex justify-end gap-1">
			{m.placedHere && (
				<fetcher.Form method="POST" action={here}>
					<Hidden
						fields={{ intent: 'unlock', boxId: box.id, participantId: m.id }}
					/>
					<Button
						type="submit"
						size="icon"
						variant="ghost"
						className="h-8 w-8"
						disabled={busy}
						aria-label={
							m.placedHere === 'printed'
								? `Unlock ${name}’s printed badge from this box`
								: `Release ${name} from their printed batch`
						}
						title={
							m.placedHere === 'printed'
								? 'Unlock printed badge'
								: 'Release from batch'
						}
					>
						<LockOpen className="h-4 w-4" />
					</Button>
				</fetcher.Form>
			)}
			<RemoveMemberButton box={box} member={m} />
		</div>
	)
}

/**
 * Hand-picked people are dropped from the box; people the rule matches are
 * left out (listed under Left out, where they can be put back).
 */
function RemoveMemberButton({
	box,
	member: m,
}: {
	box: SelectedBox
	member: MemberRow
}) {
	const [open, setOpen] = React.useState(false)
	const fetcher = useFetcher<{ error?: string }>()
	const here = useHere()
	const close = React.useCallback(() => setOpen(false), [])
	const busy = useCloseOnSuccess(fetcher, close)
	const name = `${m.firstName} ${m.familyName}`
	const formId = `remove-member-${box.id}-${m.id}`
	const copy = {
		manual: {
			label: 'Remove from box',
			title: `Remove ${name} from this box?`,
			body: 'They were added by hand, so they’ll no longer be in the box.',
		},
		rule: {
			label: 'Leave out of box',
			title: `Leave ${name} out of this box?`,
			body: 'They match the box’s rule. They’ll go to the next box below whose rule they match, if any, and be listed here under Left out, where you can put them back.',
		},
		locked: {
			label: 'Take out of box',
			title: `Take ${name} out of this box?`,
			body: 'They no longer match the box’s rule and are only here because their badge was printed through it.',
		},
	}[m.reason]
	const lock =
		m.placedHere === 'printed'
			? ' Their printed badge will be unlocked from this box.'
			: m.placedHere
				? ' Their place in the printed batch will be released.'
				: ''
	return (
		<>
			<Button
				type="button"
				size="icon"
				variant="ghost"
				className="h-8 w-8"
				onClick={() => setOpen(true)}
				aria-label={`${copy.label}: ${name}`}
				title={copy.label}
			>
				<X className="h-4 w-4" />
			</Button>
			<Dialog open={open} onOpenChange={o => !busy && setOpen(o)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="break-words">{copy.title}</DialogTitle>
						<DialogDescription>
							{copy.body}
							{lock} The participant isn’t affected.
						</DialogDescription>
					</DialogHeader>
					<fetcher.Form method="POST" action={here} id={formId}>
						<Hidden
							fields={{
								intent: 'remove-member',
								boxId: box.id,
								participantId: m.id,
							}}
						/>
					</fetcher.Form>
					<FormError error={fetcher.data?.error} />
					<DialogFooter>
						<Button variant="outline" onClick={close} disabled={busy}>
							Cancel
						</Button>
						<Button
							type="submit"
							variant="destructive"
							form={formId}
							disabled={busy}
						>
							{busy ? 'Working…' : copy.label}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}

/** People the rule matches who were taken out by hand. */
export function LeftOutList({ box }: { box: SelectedBox }) {
	if (box.leftOut.length === 0) return null
	return (
		<section className="rounded-lg border bg-card p-4 shadow-sm">
			<h3 className="text-sm font-semibold">Left out ({box.leftOut.length})</h3>
			<p className="mt-0.5 text-xs text-muted-foreground">
				They match the rule but were taken out by hand.
			</p>
			<ul className="mt-2 divide-y">
				{box.leftOut.map(p => (
					<LeftOutRow key={p.id} boxId={box.id} person={p} />
				))}
			</ul>
		</section>
	)
}

function LeftOutRow({
	boxId,
	person: p,
}: {
	boxId: string
	person: SelectedBox['leftOut'][number]
}) {
	const fetcher = useFetcher()
	const here = useHere()
	return (
		<li className="flex items-center gap-2.5 py-2">
			<Initials p={p} />
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">
					{personName(p)}
				</span>
				<span className="block truncate text-xs text-muted-foreground">
					{p.code}
				</span>
			</span>
			<fetcher.Form method="POST" action={here}>
				<Hidden fields={{ intent: 'restore', boxId, participantId: p.id }} />
				<Button
					type="submit"
					size="sm"
					variant="outline"
					disabled={fetcher.state !== 'idle'}
				>
					Put back
				</Button>
			</fetcher.Form>
		</li>
	)
}
