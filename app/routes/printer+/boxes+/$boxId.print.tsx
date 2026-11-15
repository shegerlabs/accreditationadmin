import { AuditAction, AuditEntityType } from '@prisma/client'
import { BlobProvider, Document } from '@react-pdf/renderer'
import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	Form,
	Link,
	useLoaderData,
	useNavigation,
	useSearchParams,
} from '@remix-run/react'
import { AlertTriangle, Printer } from 'lucide-react'
import QRCode from 'qrcode'
import * as React from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { LegacyBadgePages } from '~/components/badge'
import {
	type BadgeElement,
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
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { badgeQrUrl } from '~/utils/badge-qr'
import { MAX_PER_PRINT, placementsForPrint } from '~/utils/boxes'
import { actionSummary, printPeople, readyInBox } from '~/utils/boxes.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import {
	getAttachmentFileSrc,
	getParticipantDocumentFileSrc,
	invariantResponse,
} from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

function backTo(boxId: string, part: string | null) {
	const sp = new URLSearchParams({ box: boxId })
	if (part) sp.set('part', part)
	return `/printer/boxes?${sp}`
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	const url = new URL(request.url)
	const baseUrl = `${url.protocol}//${url.host}`
	const partKey = url.searchParams.get('part')

	const found = await readyInBox(user.id, params.boxId ?? '', partKey)
	invariantResponse(found, 'This box isn’t in your events', { status: 404 })
	// A split box is packed per smaller box, so it's printed one at a time.
	if (found.box.splitBy && !found.part)
		return redirectWithToast(backTo(found.box.id, null), {
			type: 'message',
			title: 'Pick a smaller box',
			description: 'This box is split; print each smaller box on its own.',
		})

	// ?only= prints just the people ticked in the box, if still ready.
	const only = new Set(
		(url.searchParams.get('only') ?? '').split(',').filter(Boolean),
	)
	const picked = only.size
		? found.ready.filter(p => only.has(p.id))
		: found.ready
	const ready = picked.slice(0, MAX_PER_PRINT)
	const ids = ready.map(p => p.id)
	const [participants, templates] = await Promise.all([
		prisma.participant.findMany({
			where: { id: { in: ids } },
			select: {
				id: true,
				firstName: true,
				familyName: true,
				email: true,
				organization: true,
				jobTitle: true,
				badgeVersion: true,
				attendClosedSession: true,
				attendExecutiveCouncilClosedSession: true,
				participantTypeId: true,
				title: { select: { name: true } },
				country: { select: { name: true } },
				nationality: { select: { name: true } },
				participantType: { select: { name: true } },
				event: { select: { name: true } },
				documents: {
					where: { documentType: 'PHOTO' },
					select: { id: true },
					take: 1,
				},
			},
		}),
		prisma.template.findMany({
			where: {
				eventId: found.box.eventId,
				participantTypeId: { in: [...new Set(ready.map(p => p.typeId))] },
				templateType: 'BADGE',
			},
			select: {
				participantTypeId: true,
				attachments: { select: { id: true, altText: true } },
				badgeTemplate: {
					select: {
						id: true,
						name: true,
						width: true,
						height: true,
						borderWidth: true,
						borderColor: true,
						borderRadius: true,
						badgeIdPrefix: true,
						elements: true,
					},
				},
			},
		}),
	])

	const byId = new Map(participants.map(p => [p.id, p]))
	const templateByType = new Map(templates.map(t => [t.participantTypeId, t]))
	const badges = ids.flatMap(id => {
		const p = byId.get(id)
		if (!p) return []
		const template = templateByType.get(p.participantTypeId)
		const attachment = (alt: string) =>
			getAttachmentFileSrc(
				template?.attachments.find(a => a.altText === alt)?.id ?? '',
			)
		const elements =
			(template?.badgeTemplate?.elements as unknown as BadgeElement[] | null) ??
			[]
		// No designed template: the badge falls back to the old fixed layout,
		// which always has a photo.
		const legacy = elements.length === 0
		const needsPhoto = legacy || elements.some(el => el.type === 'PHOTO')
		return [
			{
				id: p.id,
				firstName: p.firstName,
				familyName: p.familyName,
				title: p.title?.name ?? null,
				email: p.email,
				organization: p.organization,
				jobTitle: p.jobTitle,
				country: p.country.name,
				nationality: p.nationality.name,
				typeName: p.participantType.name,
				eventName: p.event.name,
				closedSession: p.attendClosedSession,
				executiveCouncilClosedSession: p.attendExecutiveCouncilClosedSession,
				profileUrl: badgeQrUrl(baseUrl, 'requests', p),
				photoUrl: getParticipantDocumentFileSrc(p.documents[0]?.id ?? ''),
				frontUrl: attachment('Front'),
				backUrl: attachment('Back'),
				template: template?.badgeTemplate ?? null,
				problems: {
					noPhoto: needsPhoto && !p.documents[0],
					noDesign: legacy,
				},
			},
		]
	})

	return json({
		boxId: found.box.id,
		name: found.part
			? `${found.box.name} › ${found.part.label}`
			: found.box.name,
		partKey: found.part?.key ?? null,
		badges,
		selection: only.size
			? { asked: only.size, notReady: only.size - picked.length }
			: null,
		waiting: found.waiting,
		left: picked.length - ready.length,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const partKey = String(formData.get('part') ?? '') || null
	const boxId = params.boxId ?? ''
	if (formData.get('intent') !== 'printed')
		return redirectWithToast(backTo(boxId, partKey), {
			type: 'message',
			title: 'Nothing printed',
			description: 'The box was left as it was.',
		})

	const found = await readyInBox(user.id, boxId, partKey)
	invariantResponse(found, 'This box isn’t in your events', { status: 404 })
	// A split box is packed per smaller box, so it's printed one at a time.
	if (found.box.splitBy && !found.part)
		return redirectWithToast(backTo(found.box.id, null), {
			type: 'message',
			title: 'Pick a smaller box',
			description: 'This box is split; print each smaller box on its own.',
		})

	const confirmed = new Set(
		String(formData.get('ids') ?? '')
			.split(',')
			.filter(Boolean),
	)
	const stillReady = found.ready.filter(p => confirmed.has(p.id))
	const people = stillReady.slice(0, MAX_PER_PRINT)
	const name = found.part
		? `${found.box.name} › ${found.part.label}`
		: found.box.name
	if (people.length === 0)
		return redirectWithToast(backTo(boxId, partKey), {
			type: 'error',
			title: 'Nothing printed',
			description:
				'Nobody in the preview was still waiting to print. Check the box again.',
		})

	const { done, skipped, failed } = await printPeople({
		request,
		userId: user.id,
		box: found.box,
		scopeName: name,
		people,
	})

	// Badges marked printed must be locked even if the run stopped early, or
	// they could drift to another box while sitting in this pile.
	let locked = true
	try {
		await lockToBox({ request, userId: user.id, found, name, done })
	} catch (error) {
		console.error(`Couldn't lock badges printed with box "${name}":`, error)
		locked = false
	}

	const summary = actionSummary({
		name,
		skipped: skipped + (confirmed.size - stillReady.length),
		left: found.ready.length - done.length - skipped,
	})
	if (failed || !locked)
		return redirectWithToast(backTo(boxId, partKey), {
			type: 'error',
			title: failed
				? `Stopped after ${done.length} of ${people.length}`
				: `${done.length} printed, not locked`,
			description: [
				failed &&
					`Something went wrong saving the rest, so the last ${failed} badges of this run weren’t marked printed. Keep them: they’ll show as ready on the next run, and you can confirm them without printing again.`,
				!locked &&
					'The printed badges couldn’t be locked to this box. Tell an admin before re-sorting the pile.',
				summary,
			]
				.filter(Boolean)
				.join(' '),
		})

	return redirectWithToast(backTo(boxId, partKey), {
		type: 'success',
		title: `${done.length} printed`,
		description: summary,
	})
}

/**
 * Lock printed badges to this box. A Size batch freezes as a whole: its
 * unprinted members are reserved (no printedAt) until they print.
 */
async function lockToBox({
	request,
	userId,
	found,
	name,
	done,
}: {
	request: Request
	userId: string
	found: NonNullable<Awaited<ReturnType<typeof readyInBox>>>
	name: string
	done: { id: string }[]
}) {
	if (done.length === 0) return
	const allParts = found.part
		? found.allParts.filter(p => p.key === found.part?.key)
		: found.allParts
	const placements = placementsForPrint(
		found.box,
		found.box.splitBy ? allParts : null,
		found.allMembers,
		new Set(done.map(p => p.id)),
		found.placements,
	)
	const now = new Date()
	const entries = Object.entries(placements)
	const fresh = entries.filter(([id]) => !found.placements[id])
	// Reserved in this box earlier, printed now.
	const upgraded = entries
		.filter(([id, p]) => p.printed && found.placements[id]?.printed === false)
		.map(([id]) => id)
	if (fresh.length || upgraded.length) {
		await prisma.$transaction([
			prisma.boxPlacement.createMany({
				data: fresh.map(([participantId, p]) => ({
					participantId,
					boxId: p.boxId,
					splitBy: p.splitBy,
					part: p.part,
					printedById: p.printed ? userId : null,
					printedAt: p.printed ? now : null,
				})),
				skipDuplicates: true,
			}),
			prisma.boxPlacement.updateMany({
				where: {
					participantId: { in: upgraded },
					boxId: found.box.id,
					printedAt: null,
				},
				data: { printedById: userId, printedAt: now },
			}),
		])
		const printed = fresh.filter(([, p]) => p.printed).length + upgraded.length
		const reserved = fresh.length - fresh.filter(([, p]) => p.printed).length
		await auditRequest({
			request,
			action: AuditAction.UPDATE,
			entityType: AuditEntityType.BOX,
			entityId: found.box.id,
			description: reserved
				? `Locked ${printed} printed badge(s) to box "${name}" and reserved ${reserved} more in the same batch`
				: `Locked ${printed} printed badge(s) to box "${name}"`,
			userId,
			tenantId: found.box.tenantId,
			metadata: {
				printedIds: [
					...fresh.filter(([, p]) => p.printed).map(([id]) => id),
					...upgraded,
				],
				reservedIds: fresh.filter(([, p]) => !p.printed).map(([id]) => id),
			},
		})
	}
}

type BadgeRow = ReturnType<
	typeof useLoaderData<typeof loader>
>['badges'][number]

function hasDesign(
	b: BadgeRow,
): b is BadgeRow & { template: NonNullable<BadgeRow['template']> } {
	return (
		!!b.template &&
		(b.template.elements as unknown as BadgeElement[])?.length > 0
	)
}

function toBadgeData(
	b: BadgeRow & { template: NonNullable<BadgeRow['template']> },
): ParticipantBadgeData {
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

/**
 * Every ready badge in the box, front and back, as one printable document.
 * Reports when the PDF has finished generating, so nobody can confirm a box
 * whose badges haven't reached the printer.
 */
function BoxBadgesDocument({
	badges,
	title,
	onStatus,
}: {
	badges: BadgeRow[]
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
				Preparing {badges.length} badges…
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

function hasProblem(b: BadgeRow) {
	return b.problems.noPhoto || b.problems.noDesign
}

/**
 * Badges that would come out wrong, shown before anything is printed, with a
 * choice to leave them out of this run. Left-out people stay ready in the box.
 */
function PrintCheck({
	badges,
	leftOut,
	onLeaveOut,
	onPutBack,
}: {
	badges: BadgeRow[]
	leftOut: boolean
	onLeaveOut: () => void
	onPutBack: () => void
}) {
	const flagged = badges.filter(hasProblem)
	if (flagged.length === 0) return null
	const noPhoto = flagged.filter(b => b.problems.noPhoto)
	const noDesign = new Map<string, BadgeRow[]>()
	for (const b of flagged.filter(b => b.problems.noDesign))
		noDesign.set(b.typeName, [...(noDesign.get(b.typeName) ?? []), b])
	const names = (bs: BadgeRow[]) =>
		bs.map(b => `${b.firstName} ${b.familyName}`).join(', ')
	const n = flagged.length
	const badgesWord = n === 1 ? 'badge' : 'badges'
	const mixed = noPhoto.length > 0 && noDesign.size > 0
	const heading = leftOut
		? `${n} ${badgesWord} left out of this run. ${n === 1 ? 'It stays' : 'They stay'} ready in the box.`
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
 * people stay ready in the box for the next run.
 */
function PrintedChecklist({
	badges,
	came,
	onChange,
}: {
	badges: BadgeRow[]
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

export default function PrintBoxDialog() {
	const { boxId, name, partKey, badges, selection, waiting, left } =
		useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()
	const navigation = useNavigation()
	const busy = navigation.state === 'submitting'
	const [isClient, setIsClient] = React.useState(false)
	React.useEffect(() => setIsClient(true), [])
	const [pdfStatus, setPdfStatus] = React.useState<PdfStatus>('preparing')
	const cancelTo = backTo(boxId, partKey ?? searchParams.get('part'))

	const [leftOut, setLeftOut] = React.useState(false)
	const toPrint = React.useMemo(
		() => (leftOut ? badges.filter(b => !hasProblem(b)) : badges),
		[badges, leftOut],
	)
	const changeLeftOut = (next: boolean) => {
		setPdfStatus('preparing')
		setLeftOut(next)
	}
	// Set while ticking off which badges came out; null = the preview.
	const [came, setCame] = React.useState<Set<string> | null>(null)
	const confirmed = came ? toPrint.filter(b => came.has(b.id)) : toPrint

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
					<DialogTitle className="text-center">
						{came
							? 'Which badges came out right?'
							: `Print ${toPrint.length} ${toPrint.length === 1 ? 'badge' : 'badges'}`}
					</DialogTitle>
					<p className="break-words text-center font-medium">
						{name}
						{selection && (
							<span className="font-normal text-muted-foreground">
								{' '}
								· the people you selected
							</span>
						)}
					</p>
					<DialogDescription className="mx-auto max-w-[65ch] break-words text-center">
						{came
							? 'Only ticked badges are marked printed.'
							: 'Print from the preview, then confirm below.'}
						{!came &&
							selection &&
							selection.notReady > 0 &&
							` ${selection.notReady} of those you selected ${selection.notReady === 1 ? 'is' : 'are'} no longer ready and won’t be printed.`}
						{!came &&
							!selection &&
							waiting > 0 &&
							` ${waiting} more in this box ${waiting === 1 ? 'isn’t' : 'aren’t'} ready and won’t be marked.`}
						{!came &&
							left > 0 &&
							` This run holds the first ${badges.length}; the other ${left} ready ${left === 1 ? 'badge waits' : 'badges wait'} for the next run.`}
					</DialogDescription>
				</DialogHeader>

				{!came && (
					<PrintCheck
						badges={badges}
						leftOut={leftOut}
						onLeaveOut={() => changeLeftOut(true)}
						onPutBack={() => changeLeftOut(false)}
					/>
				)}

				<div className="min-h-0 flex-1">
					{badges.length === 0 ? (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							{selection
								? 'None of the people you selected are still waiting to print.'
								: 'Nobody in this box is waiting to print.'}
						</div>
					) : toPrint.length === 0 ? (
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
							{/* Kept mounted under the checklist so going back doesn't regenerate it. */}
							<div className={came ? 'hidden' : 'h-full'}>
								{isClient && (
									<BoxBadgesDocument
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
						{partKey && <input type="hidden" name="part" value={partKey} />}
						<input
							type="hidden"
							name="ids"
							value={confirmed.map(b => b.id).join(',')}
						/>
						{toPrint.length === 0 ? (
							<Button asChild variant="outline" className="flex-1">
								<Link to={cancelTo} preventScrollReset>
									Close
								</Link>
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
												: `All ${toPrint.length} printed`}
								</Button>
							</>
						)}
					</Form>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
