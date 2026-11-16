import { BlobProvider, Document } from '@react-pdf/renderer'
import { Form, Link, useNavigation } from '@remix-run/react'
import { AlertTriangle, Printer } from 'lucide-react'
import QRCode from 'qrcode'
import * as React from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { LegacyBadgePages } from '~/components/badge'
import {
	dbTemplateToConfig,
	DynamicBadgePages,
	dynamicBadgeQrData,
	type ParticipantBadgeData,
} from '~/components/badge-designer'
import { Alert } from '~/components/ui/alert'
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
import { hasProblem, type PrintBadge } from '~/utils/batch-print'
import { cn } from '~/utils/misc'

type Designed = PrintBadge & { template: NonNullable<PrintBadge['template']> }

function hasDesign(b: PrintBadge): b is Designed {
	return !!b.template && b.template.elements.length > 0
}

function toBadgeData(b: Designed): ParticipantBadgeData {
	return {
		badgeId: `${b.template.badgeIdPrefix}-${b.id.slice(-6).toUpperCase()}`,
		firstName: b.firstName,
		familyName: b.familyName,
		fullName: `${b.firstName} ${b.familyName}`,
		title: b.title ?? undefined,
		organization: b.organization ?? undefined,
		jobTitle: b.jobTitle ?? undefined,
		country: b.country,
		nationality: b.nationality,
		email: b.email ?? undefined,
		participantType: b.typeName,
		eventName: b.eventName,
		closedSession: b.closedSession,
		executiveCouncilClosedSession: b.executiveCouncilClosedSession,
		profileUrl: b.profileUrl,
		photoUrl: b.photoUrl,
	}
}

type PdfStatus = 'preparing' | 'ready' | 'failed'
const ignoreStatus = () => {}

/**
 * The badges, front and back, as one printable document. Reports when the PDF
 * has finished generating, so nobody can confirm badges that haven't reached
 * the printer.
 */
function BadgesDocument({
	badges,
	title,
	onStatus,
}: {
	badges: PrintBadge[]
	title: string
	onStatus: (status: PdfStatus) => void
}) {
	const prepared = React.useMemo(
		() =>
			badges.map(b => {
				if (!hasDesign(b)) return { b, design: null }
				const template = dbTemplateToConfig(b.template)
				const data = toBadgeData(b)
				return {
					b,
					design: {
						template,
						data,
						qr: dynamicBadgeQrData(template.elements, data),
					},
				}
			}),
		[badges],
	)
	const [qrs, setQrs] = React.useState<Record<string, string> | null>(null)

	React.useEffect(() => {
		let cancelled = false
		Promise.all(
			prepared.map(async ({ b, design }) => [
				b.id,
				await QRCode.toDataURL(design?.qr ?? b.profileUrl, {
					width: 128,
					margin: 0,
				}),
			]),
		)
			.then(entries => {
				if (!cancelled) setQrs(Object.fromEntries(entries))
			})
			.catch(() => {
				if (!cancelled) onStatus('failed')
			})
		return () => {
			cancelled = true
		}
	}, [prepared, onStatus])

	if (!qrs)
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Preparing {badges.length} {badges.length === 1 ? 'badge' : 'badges'}…
			</div>
		)

	const pdf = (
		<Document title={title}>
			{prepared.map(({ b, design }) =>
				design ? (
					<DynamicBadgePages
						key={b.id}
						template={design.template}
						participant={design.data}
						qrCodeDataURL={qrs[b.id] ?? ''}
						frontBackgroundUrl={b.frontUrl}
						backBackgroundUrl={b.backUrl}
					/>
				) : (
					<LegacyBadgePages
						key={b.id}
						badgeInfo={{
							id: `SHIRINAB-${b.id}`,
							name: `${b.firstName} ${b.familyName}`,
							organization: b.organization ?? '',
							closedSession: b.closedSession,
							executiveCouncilClosedSession: b.executiveCouncilClosedSession,
							profileUrl: b.profileUrl,
						}}
						photoUrl={b.photoUrl}
						frontBackgroundUrl={b.frontUrl}
						backBackgroundUrl={b.backUrl}
						qrCodeDataURL={qrs[b.id] ?? ''}
					/>
				),
			)}
		</Document>
	)

	return (
		<BlobProvider document={pdf}>
			{({ url, loading, error }) => (
				<PdfFrame
					url={url}
					loading={loading}
					failed={!!error}
					count={badges.length}
					title={title}
					onStatus={onStatus}
				/>
			)}
		</BlobProvider>
	)
}

function PdfFrame({
	url,
	loading,
	failed,
	count,
	title,
	onStatus,
}: {
	url: string | null
	loading: boolean
	failed: boolean
	count: number
	title: string
	onStatus: (status: PdfStatus) => void
}) {
	const status: PdfStatus = failed
		? 'failed'
		: loading || !url
			? 'preparing'
			: 'ready'
	React.useEffect(() => onStatus(status), [status, onStatus])

	if (status === 'failed')
		return (
			<div className="flex h-full items-center justify-center text-sm text-destructive">
				The badges couldn’t be generated. Close and try again.
			</div>
		)
	if (status === 'preparing')
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Generating {count} {count === 1 ? 'badge' : 'badges'}…
			</div>
		)
	return (
		<iframe src={url ?? undefined} title={title} className="h-full w-full" />
	)
}

/**
 * Badges that would come out wrong, shown before anything is printed, with a
 * choice to leave them out of this run.
 */
function PrintCheck({
	badges,
	leftOut,
	stayWhere,
	onLeaveOut,
	onPutBack,
}: {
	badges: PrintBadge[]
	leftOut: boolean
	stayWhere: string
	onLeaveOut: () => void
	onPutBack: () => void
}) {
	const flagged = badges.filter(b => hasProblem(b.problems))
	if (flagged.length === 0) return null
	const noPhoto = flagged.filter(b => b.problems.noPhoto)
	const noDesign = new Map<string, PrintBadge[]>()
	for (const b of flagged.filter(b => b.problems.noDesign))
		noDesign.set(b.typeName, [...(noDesign.get(b.typeName) ?? []), b])
	const names = (bs: PrintBadge[]) =>
		bs.map(b => `${b.firstName} ${b.familyName}`).join(', ')
	const n = flagged.length
	const badgesWord = n === 1 ? 'badge' : 'badges'
	const mixed = noPhoto.length > 0 && noDesign.size > 0
	const heading = leftOut
		? `${n} ${badgesWord} left out of this run. ${n === 1 ? 'It stays' : 'They stay'} ${stayWhere}.`
		: mixed
			? `${n} ${badgesWord} won’t come out right`
			: noPhoto.length
				? `${n} ${badgesWord} ${n === 1 ? 'has' : 'have'} no photo`
				: `${n} ${badgesWord} will print on the old layout`

	return (
		<Alert variant="warning" className="flex-shrink-0 text-sm">
			<AlertTriangle className="h-4 w-4" aria-hidden="true" />
			<div className="flex items-start gap-3">
				<div className="min-w-0 flex-1 space-y-1">
					<p className="font-medium">{heading}</p>
					{noPhoto.length > 0 && (
						<p className="break-words">
							{mixed && <span className="font-medium">No photo: </span>}
							{names(noPhoto)}
						</p>
					)}
					{[...noDesign].map(([type, bs]) => (
						<p key={type} className="break-words">
							<span className="font-medium">No badge design for {type}: </span>
							{names(bs)}
						</p>
					))}
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="flex-shrink-0"
					onClick={leftOut ? onPutBack : onLeaveOut}
				>
					{leftOut
						? `Put the ${n === 1 ? 'badge' : n} back`
						: n === 1
							? 'Leave it out'
							: `Leave these ${n} out`}
				</Button>
			</div>
		</Alert>
	)
}

/**
 * After a jam or a misprint: tick the badges that came out right. Unticked
 * people are left as they were, for the next run.
 */
function PrintedChecklist({
	badges,
	came,
	onChange,
}: {
	badges: PrintBadge[]
	came: Set<string>
	onChange: (came: Set<string>) => void
}) {
	const upTo = badges.findIndex(b => !came.has(b.id))
	const contiguous =
		upTo === -1 || badges.slice(upTo).every(b => !came.has(b.id))
	const upToValue = upTo === -1 ? badges.length : upTo

	return (
		<div className="flex h-full flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<Label htmlFor="printed-up-to">Printed up to badge</Label>
				<Input
					id="printed-up-to"
					type="number"
					inputMode="numeric"
					min={0}
					max={badges.length}
					className="w-20 text-base"
					value={contiguous ? upToValue : ''}
					onChange={e => {
						const n = Math.max(
							0,
							Math.min(badges.length, Number(e.target.value) || 0),
						)
						onChange(new Set(badges.slice(0, n).map(b => b.id)))
					}}
				/>
				<span className="text-muted-foreground">
					of {badges.length}. Untick any that came out wrong.
				</span>
			</div>
			<ol className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
				{badges.map((b, i) => {
					const id = `came-${b.id}`
					return (
						<li key={b.id}>
							<label
								htmlFor={id}
								className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm"
							>
								<Checkbox
									id={id}
									checked={came.has(b.id)}
									onCheckedChange={checked => {
										const next = new Set(came)
										if (checked) next.add(b.id)
										else next.delete(b.id)
										onChange(next)
									}}
								/>
								<span className="w-8 tabular-nums text-muted-foreground">
									{i + 1}
								</span>
								<span className="min-w-0 flex-1 truncate">
									{b.familyName.toUpperCase()}, {b.firstName}
								</span>
								<span className="hidden text-muted-foreground sm:inline">
									{b.typeName}
								</span>
								<span className="w-24 text-right tabular-nums text-muted-foreground">
									pages {2 * i + 1}–{2 * i + 2}
								</span>
							</label>
						</li>
					)
				})}
			</ol>
		</div>
	)
}

/**
 * Print a run of badges from one PDF, then confirm which came out. Posts
 * `intent` ("printed" or "not-printed") and `ids` (the confirmed badges) to
 * the route's action, along with `fields`.
 */
export function BatchPrintDialog({
	badges,
	name,
	context,
	notes,
	stayWhere,
	empty,
	cancelTo,
	fields,
}: {
	badges: PrintBadge[]
	/** What is being printed, under the title: a box or smaller box. */
	name: string
	/** Shown after the name, e.g. "the people you selected". */
	context?: string
	/** Extra sentences for the preview's description. */
	notes?: string
	/** Where badges left out of the run stay, e.g. "ready in the box". */
	stayWhere: string
	/** Shown when there's nothing to print. */
	empty: string
	cancelTo: string
	fields?: React.ReactNode
}) {
	const navigation = useNavigation()
	const busy = navigation.state === 'submitting'
	const [isClient, setIsClient] = React.useState(false)
	React.useEffect(() => setIsClient(true), [])
	const [pdfStatus, setPdfStatus] = React.useState<PdfStatus>('preparing')

	const [leftOut, setLeftOut] = React.useState(false)
	const toPrint = React.useMemo(
		() => (leftOut ? badges.filter(b => !hasProblem(b.problems)) : badges),
		[badges, leftOut],
	)
	const changeLeftOut = (next: boolean) => {
		setPdfStatus('preparing')
		setLeftOut(next)
	}
	// Set while ticking off which badges came out; null = the preview.
	const [came, setCame] = React.useState<Set<string> | null>(null)
	const confirmed = came ? toPrint.filter(b => came.has(b.id)) : toPrint
	// One card to check alignment and stock before the whole run. Never marked.
	const [testing, setTesting] = React.useState(false)
	const sample = toPrint[0]
	const sampleRun = React.useMemo(() => (sample ? [sample] : []), [sample])

	const n = toPrint.length
	const title = testing
		? 'Test print'
		: came
			? 'Which badges came out right?'
			: `Print ${n} ${n === 1 ? 'badge' : 'badges'}`
	const description = testing
		? `Print this one badge (${sample?.firstName} ${sample?.familyName}) to check the card lines up and the stock is right. Nothing is marked printed.`
		: came
			? 'Only ticked badges are marked printed.'
			: `Print from the preview, then confirm below.${notes ? ` ${notes}` : ''}`

	return (
		<Dialog open onOpenChange={() => {}}>
			<DialogContent
				className="flex h-[90vh] max-w-4xl flex-col"
				hideCloseButton
				onEscapeKeyDown={e => e.preventDefault()}
				onPointerDownOutside={e => e.preventDefault()}
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader className="flex-shrink-0">
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
						<Printer className="h-6 w-6 text-green-600" aria-hidden="true" />
					</div>
					<DialogTitle className="text-center">{title}</DialogTitle>
					<p className="break-words text-center font-medium">
						{name}
						{context && (
							<span className="font-normal text-muted-foreground">
								{' '}
								· {context}
							</span>
						)}
					</p>
					<DialogDescription className="mx-auto max-w-[65ch] break-words text-center">
						{description}
					</DialogDescription>
				</DialogHeader>

				{!came && !testing && (
					<PrintCheck
						badges={badges}
						leftOut={leftOut}
						stayWhere={stayWhere}
						onLeaveOut={() => changeLeftOut(true)}
						onPutBack={() => changeLeftOut(false)}
					/>
				)}

				{!came && !testing && n > 1 && (
					<div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm">
						<span className="text-muted-foreground">
							New card stock, or first run today?
						</span>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setTesting(true)}
						>
							Test print 1 badge
						</Button>
					</div>
				)}

				<div className="min-h-0 flex-1">
					{badges.length === 0 ? (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							{empty}
						</div>
					) : n === 0 ? (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							Every badge in this run is left out.
						</div>
					) : (
						<>
							{came && (
								<PrintedChecklist
									badges={toPrint}
									came={came}
									onChange={setCame}
								/>
							)}
							{testing && isClient && (
								<BadgesDocument
									badges={sampleRun}
									title={`${name} (test print)`}
									onStatus={ignoreStatus}
								/>
							)}
							{/* Kept mounted under the checklist and the test print so going back doesn't regenerate it. */}
							<div className={came || testing ? 'hidden' : 'h-full'}>
								{isClient && (
									<BadgesDocument
										key={leftOut ? 'without-flagged' : 'all'}
										badges={toPrint}
										title={name}
										onStatus={setPdfStatus}
									/>
								)}
							</div>
						</>
					)}
				</div>

				<DialogFooter className="flex-shrink-0 gap-2 sm:gap-0">
					<Form method="POST" className="flex w-full flex-wrap gap-2">
						<AuthenticityTokenInput />
						<HoneypotInputs />
						{fields}
						<input
							type="hidden"
							name="ids"
							value={confirmed.map(b => b.id).join(',')}
						/>
						{n === 0 ? (
							<Button asChild variant="outline" className="flex-1">
								<Link to={cancelTo} preventScrollReset>
									Close
								</Link>
							</Button>
						) : testing ? (
							<Button
								key="end-test"
								type="button"
								className="flex-1"
								onClick={() => setTesting(false)}
							>
								Back to the run
							</Button>
						) : came ? (
							<>
								<Button
									key="back"
									type="button"
									variant="outline"
									className="flex-1"
									disabled={busy}
									onClick={() => setCame(null)}
								>
									Back to preview
								</Button>
								<Button
									key="mark-some"
									type="submit"
									name="intent"
									value={confirmed.length ? 'printed' : 'not-printed'}
									className="flex-1"
									disabled={busy}
								>
									{busy
										? 'Saving…'
										: confirmed.length
											? `Mark ${confirmed.length} printed`
											: 'None printed'}
								</Button>
							</>
						) : (
							<>
								<Button
									key="not-printed"
									type="submit"
									variant="outline"
									name="intent"
									value="not-printed"
									className="flex-1"
									disabled={busy}
								>
									Not printed
								</Button>
								<Button
									key="some-failed"
									type="button"
									variant="outline"
									className="flex-1"
									disabled={busy || pdfStatus !== 'ready'}
									onClick={() => setCame(new Set(toPrint.map(b => b.id)))}
								>
									Some didn’t print
								</Button>
								<Button
									key="mark-all"
									type="submit"
									name="intent"
									value="printed"
									className="flex-1"
									disabled={busy || pdfStatus !== 'ready'}
								>
									{busy
										? 'Saving…'
										: pdfStatus === 'preparing'
											? 'Preparing badges…'
											: pdfStatus === 'failed'
												? 'Badges not generated'
												: `All ${n} printed`}
								</Button>
							</>
						)}
					</Form>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
