import { Link } from '@remix-run/react'
import { Lock } from 'lucide-react'
import * as React from 'react'
import {
	type BatchInfo,
	type BoxListItem,
	type BoxesView,
	type BoxViewer,
	type MemberRow,
	type PartCard,
	type PartSummary,
	type SelectedBox,
	type Stage,
} from '~/utils/boxes'
import { DataList, type DataListColumn } from '~/components/data-list'
import { cn } from '~/utils/misc'
import { Initials, personName, StageBar, StageLegend, StagePill } from './stage'

/**
 * Boxes on the left, the open box (or smaller box) on the right. The open box
 * lives in the URL (?box=&part=), so it survives reloads and form posts.
 */
export function BoxBrowser({
	view,
	viewer,
	sidebarAction,
	boxAction,
	headerControls,
	partAction,
	memberActions,
	selectionAction,
	footer,
	emptyBox,
	noBoxes,
}: {
	view: BoxesView
	viewer: BoxViewer
	sidebarAction?: React.ReactNode
	/** Extra controls on a box's row in the list, e.g. reordering. */
	boxAction?: (box: BoxListItem, index: number) => React.ReactNode
	headerControls: (box: SelectedBox) => React.ReactNode
	partAction?: (box: SelectedBox, part: PartCard) => React.ReactNode
	memberActions?: (box: SelectedBox, m: MemberRow) => React.ReactNode
	/**
	 * Lets people ready to print be ticked in the member list; renders the
	 * controls for what's ticked, e.g. printing just those.
	 */
	selectionAction?: (
		box: SelectedBox,
		ids: string[],
		clear: () => void,
	) => React.ReactNode
	footer?: (box: SelectedBox) => React.ReactNode
	emptyBox: React.ReactNode
	noBoxes: React.ReactNode
}) {
	const { boxes, selected } = view
	const showEvent = new Set(boxes.map(b => b.eventName)).size > 1
	// Admins keep a list: its order decides which box people land in, and it
	// holds the reorder and new-box controls. Printers only need to switch.
	const withList = viewer === 'admin'

	return (
		<div
			className={cn(
				withList ? 'grid gap-6 lg:grid-cols-[260px_1fr]' : 'space-y-4',
			)}
		>
			{withList ? (
				<aside className="space-y-3">
					<div className="flex min-h-9 items-center justify-between">
						<h2 className="text-sm font-semibold">Boxes</h2>
						{sidebarAction}
					</div>
					{boxes.length === 0 ? (
						<p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
							{noBoxes}
						</p>
					) : (
						<ul className="rounded-lg border bg-card py-1 text-sm shadow-sm">
							{boxes.map((b, index) => {
								const isSel = selected?.id === b.id
								return (
									<li
										key={b.id}
										className={cn(
											'flex items-center gap-1 pr-2',
											isSel && 'bg-muted',
										)}
									>
										<Link
											to={{ search: `?box=${b.id}` }}
											preventScrollReset
											aria-current={isSel ? 'page' : undefined}
											className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 pl-4"
										>
											<span className="min-w-0">
												<span className="block truncate font-medium">
													{b.name}
												</span>
												<span className="block truncate text-xs text-muted-foreground">
													{[showEvent && b.eventName, b.owner]
														.filter(Boolean)
														.join(' · ')}
												</span>
											</span>
											<Count
												viewer={viewer}
												total={b.total}
												ready={b.ready}
												done={b.done}
											/>
										</Link>
										{boxAction?.(b, index)}
									</li>
								)
							})}
						</ul>
					)}
				</aside>
			) : (
				boxes.length > 1 && (
					<nav
						aria-label="Boxes"
						className="flex gap-1 overflow-x-auto border-b"
					>
						{boxes.map(b => {
							const isSel = selected?.id === b.id
							return (
								<Link
									key={b.id}
									to={{ search: `?box=${b.id}` }}
									preventScrollReset
									aria-current={isSel ? 'page' : undefined}
									className={cn(
										'-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm',
										isSel
											? 'border-primary font-medium text-foreground'
											: 'border-transparent text-muted-foreground hover:text-foreground',
									)}
								>
									<span>
										{b.name}
										{showEvent && (
											<span className="ml-1 text-xs text-muted-foreground">
												· {b.eventName}
											</span>
										)}
									</span>
									<Count
										viewer={viewer}
										total={b.total}
										ready={b.ready}
										done={b.done}
									/>
								</Link>
							)
						})}
					</nav>
				)
			)}

			{!selected ? (
				<p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
					{noBoxes}
				</p>
			) : (
				<main className="min-w-0 space-y-4">
					<BoxHeader
						box={selected}
						viewer={viewer}
						controls={headerControls(selected)}
					/>
					{selected.total === 0 && !selected.parts?.length ? (
						<p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
							{emptyBox}
						</p>
					) : selected.parts ? (
						<div className="space-y-8">
							{groupParts(selected.parts).map((g, gi) => (
								<section key={g.group ?? `n:${gi}`} className="space-y-3">
									{g.group && (
										<GroupHeading
											group={g.group}
											parts={g.parts}
											viewer={viewer}
										/>
									)}
									<div
										className={cn(
											'grid gap-3 sm:grid-cols-2',
											withList ? '2xl:grid-cols-3' : 'xl:grid-cols-3',
										)}
									>
										{g.parts.map(p => (
											<PartCardView
												key={p.key}
												box={selected}
												part={p}
												viewer={viewer}
												action={partAction?.(selected, p)}
											/>
										))}
									</div>
								</section>
							))}
						</div>
					) : (
						<MemberTable
							key={`${selected.id}:${selected.part?.key ?? ''}`}
							box={selected}
							viewer={viewer}
							actions={memberActions}
							selectionAction={selectionAction}
						/>
					)}
					{footer?.(selected)}
				</main>
			)}
		</div>
	)
}

/** A divider naming a run of batches, with how far along they are. */
function GroupHeading({
	group,
	parts,
	viewer,
}: {
	group: string
	parts: PartCard[]
	viewer: BoxViewer
}) {
	const sum = (pick: (p: PartCard) => number) =>
		parts.reduce((n, p) => n + pick(p), 0)
	const total = sum(p => p.total)
	const boxes = `${parts.length} ${parts.length === 1 ? 'box' : 'boxes'}`
	const summary =
		viewer === 'admin'
			? `${total} people · ${boxes}`
			: [
					`${sum(p => p.done)} of ${total} printed`,
					sum(p => p.ready) > 0 && `${sum(p => p.ready)} ready`,
					boxes,
				]
					.filter(Boolean)
					.join(' · ')
	return (
		<h3 className="flex items-center gap-3">
			<span className="text-base font-semibold">{group}</span>
			<span className="text-sm tabular-nums text-muted-foreground">
				{summary}
			</span>
			<span aria-hidden className="h-px flex-1 bg-border" />
		</h3>
	)
}

/**
 * Runs of batches cut from the same type or surname range, so they can sit
 * under one heading. Smaller boxes that aren't batches share a null group.
 */
function groupParts<P extends { batch: BatchInfo | null }>(parts: P[]) {
	const out: Array<{ group: string | null; parts: P[] }> = []
	for (const p of parts) {
		const g = p.batch?.group ?? null
		const last = out[out.length - 1]
		if (last && last.group === g) last.parts.push(p)
		else out.push({ group: g, parts: [p] })
	}
	return out
}

/** "Box 2 of 3", or the smaller box's own name when it isn't a batch. */
function partName(part: PartSummary) {
	return part.batch ? `Box ${part.batch.index} of ${part.batch.of}` : part.label
}

/** Printers only work with badges at the printer or already printed. */
const PRINTER_STAGES: Stage[] = ['print', 'printed']
const stagesFor = (viewer: BoxViewer) =>
	viewer === 'printer' ? PRINTER_STAGES : undefined

export function partSearch(boxId: string, part: string | null) {
	const sp = new URLSearchParams({ box: boxId })
	if (part) sp.set('part', part)
	return `?${sp}`
}

/** Admins see the size; printers see their progress, and what's ready now. */
function Count({
	viewer,
	total,
	ready,
	done,
}: {
	viewer: BoxViewer
	total: number
	ready: number
	done: number
}) {
	if (viewer === 'admin')
		return (
			<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
				{total}
			</span>
		)
	return (
		<span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
			{ready > 0 && (
				<span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-900">
					{ready} ready
				</span>
			)}
			<span
				className="text-muted-foreground"
				title={`${done} of ${total} printed`}
			>
				<span className="sr-only">
					{done} of {total} printed
				</span>
				<span aria-hidden="true">
					{done}/{total}
				</span>
			</span>
		</span>
	)
}

function BoxHeader({
	box,
	viewer,
	controls,
}: {
	box: SelectedBox
	viewer: BoxViewer
	controls: React.ReactNode
}) {
	const part = box.part
	return (
		<header className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0 space-y-2">
					{part && (
						<p className="text-xs text-muted-foreground">
							<Link
								to={{ search: partSearch(box.id, null) }}
								preventScrollReset
								className="hover:text-foreground hover:underline"
							>
								← {box.name}
							</Link>
							{part.batch?.group && ` › ${part.batch.group}`}
						</p>
					)}
					<h2 className="text-lg font-semibold leading-snug">
						{part?.batch ? (
							<>
								{part.batch.group && <span>{part.batch.group} · </span>}
								{partName(part)}
							</>
						) : part ? (
							part.label
						) : (
							box.name
						)}
					</h2>
					{part?.batch && (
						<p className="text-sm text-muted-foreground">{part.batch.range}</p>
					)}
					{part ? (
						<PartTag part={part} />
					) : (
						<>
							<ul className="flex flex-wrap gap-1.5">
								{box.chips.map(c => (
									<li
										key={c}
										className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
									>
										{c}
									</li>
								))}
							</ul>
							{box.owner && (
								<p className="text-xs text-muted-foreground">
									Created by {box.owner}
								</p>
							)}
						</>
					)}
				</div>
				<div className="flex flex-wrap items-end gap-2">{controls}</div>
			</div>
			{box.inOtherBoxes > 0 && (
				<p className="text-xs text-muted-foreground">
					{box.inOtherBoxes} more {box.inOtherBoxes === 1 ? 'matches' : 'match'}{' '}
					this rule but {box.inOtherBoxes === 1 ? 'is' : 'are'} in another box:
					one higher in the list, one they were added to by hand, or the one
					their badge was printed in.
				</p>
			)}
			{box.lockedHere > 0 && (
				<p className="text-xs text-muted-foreground">
					<Lock className="mr-1 inline h-3 w-3 align-[-1px]" />
					{`${box.lockedHere} ${box.lockedHere === 1 ? 'badge is' : 'badges are'} locked here (printed in this box, or reserved in a printed batch), so they stay put whatever changes.`}
					{(box.splitBy === 'SIZE' || box.maxPerBox) &&
						' Printed batches keep their people; changing the size only re-cuts unprinted batches.'}
				</p>
			)}
			{box.total > 0 && (
				<div className="space-y-2">
					<StageBar
						counts={box.stages}
						total={box.total}
						stages={stagesFor(viewer)}
						className="h-2"
					/>
					<StageLegend counts={box.stages} stages={stagesFor(viewer)} />
				</div>
			)}
		</header>
	)
}

function PartCardView({
	box,
	part,
	viewer,
	action,
}: {
	box: SelectedBox
	part: PartCard
	viewer: BoxViewer
	action?: React.ReactNode
}) {
	return (
		<article className="flex flex-col rounded-lg border bg-card shadow-sm">
			<header className="flex items-center justify-between gap-3 border-b px-4 py-3">
				<Link
					to={{ search: partSearch(box.id, part.key) }}
					preventScrollReset
					title={part.batch?.range}
					className="group min-w-0"
				>
					<h3 className="line-clamp-2 font-semibold leading-snug group-hover:underline">
						{partName(part)}
					</h3>
				</Link>
				{action && <div className="shrink-0">{action}</div>}
			</header>
			<div className="flex flex-1 flex-col gap-3 p-4">
				<p className="text-xs text-muted-foreground">
					{viewer === 'admin'
						? `${part.total} participants`
						: `${part.done} of ${part.total} printed${
								part.ready > 0 ? ` · ${part.ready} ready to print` : ''
							}`}
					{part.manual > 0 && ` · ${part.manual} added by hand`}
				</p>
				<PartTag part={part} />
				<StageBar
					counts={part.stages}
					total={part.total}
					stages={stagesFor(viewer)}
				/>
				<StageLegend counts={part.stages} stages={stagesFor(viewer)} />
			</div>
		</article>
	)
}

function PartTag({ part }: { part: PartSummary }) {
	if (!part.locked) return null
	return (
		<span className="inline-flex w-fit items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
			<Lock className="h-3 w-3" />
			{part.frozen ? 'Printed batch · locked' : `${part.locked} locked here`}
		</span>
	)
}

function MemberTable({
	box,
	viewer,
	actions,
	selectionAction,
}: {
	box: SelectedBox
	viewer: BoxViewer
	actions?: (box: SelectedBox, m: MemberRow) => React.ReactNode
	selectionAction?: (
		box: SelectedBox,
		ids: string[],
		clear: () => void,
	) => React.ReactNode
}) {
	const all = box.members ?? []
	const members =
		viewer === 'printer'
			? all.filter(m => PRINTER_STAGES.includes(m.stage))
			: all
	const showInvitation = box.splitBy !== 'INVITATION' || !box.part
	const selectable = !!selectionAction
	// Only people ready to print can be ticked; the list keeps surname order.
	const readyIds = React.useMemo(
		() => new Set(box.readyPeople.map(p => p.id)),
		[box.readyPeople],
	)
	const [ticked, setTicked] = React.useState<Set<string>>(() => new Set())
	// Drop anyone who stopped being ready since they were ticked.
	const selected = new Set([...ticked].filter(id => readyIds.has(id)))
	const clear = () => setTicked(new Set())

	if (members.length === 0)
		return (
			<p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
				{viewer === 'printer'
					? 'Nobody here is awaiting print or printed yet.'
					: 'Nobody here yet.'}
			</p>
		)

	const columns = [
		{
			key: 'participant',
			header: 'Participant',
			render: (m: MemberRow) => (
				<span className="flex items-center gap-3">
					<Initials p={m} />
					<span className="min-w-0">
						<span className="block truncate font-medium">{personName(m)}</span>
						<span className="block truncate text-xs text-muted-foreground">
							{m.code} · {m.typeName}
						</span>
					</span>
				</span>
			),
		},
		...(showInvitation
			? [
					{
						key: 'invitation',
						header: 'Invitation',
						render: (m: MemberRow) => (
							<span className="block max-w-[240px] truncate text-muted-foreground">
								{m.invitationName}
							</span>
						),
					},
				]
			: []),
		{ key: 'why', header: 'Why', render: (m: MemberRow) => <Why m={m} /> },
		{
			key: 'status',
			header: 'Status',
			render: (m: MemberRow) => <StagePill stage={m.stage} />,
		},
	]

	return (
		<DataList
			data={members}
			// DataList types rows loosely; these are always MemberRows.
			columns={columns as DataListColumn[]}
			actions={
				actions
					? [
							{
								label: 'Actions',
								icon: null,
								render: m => actions(box, m as MemberRow),
							},
						]
					: undefined
			}
			status="idle"
			keyExtractor={m => m.id}
			selectable={selectable}
			isSelectable={m => readyIds.has(m.id)}
			selectedIds={selected}
			onSelectionChange={setTicked}
			renderBulkActions={ids => selectionAction?.(box, [...ids], clear)}
		/>
	)
}

/** Why someone is in the box, and whether a printed batch holds them here. */
function Why({ m }: { m: MemberRow }) {
	return (
		<>
			{m.reason === 'manual' ? (
				<span className="whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
					Added by hand
				</span>
			) : m.reason === 'locked' ? (
				<span className="whitespace-nowrap rounded-md bg-red-100 px-2 py-0.5 text-xs text-red-900">
					No longer matches
				</span>
			) : (
				<span className="whitespace-nowrap text-xs text-muted-foreground">
					Matches rule
				</span>
			)}
			{m.placedHere && (
				<span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
					<Lock className="h-3 w-3 shrink-0" />
					{m.placedHere === 'printed'
						? 'Printed here'
						: m.placedHere === 'reserved'
							? 'Reserved in a printed batch'
							: 'Printed outside this box'}
				</span>
			)}
		</>
	)
}
