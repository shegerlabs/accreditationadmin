import {
	BlobProvider,
	Document,
	Page,
	StyleSheet,
	Text,
	View,
} from '@react-pdf/renderer'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData, useSearchParams } from '@remix-run/react'
import { format } from 'date-fns'
import { ClipboardList } from 'lucide-react'
import * as React from 'react'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { requireUserWithRoles } from '~/utils/auth.server'
import {
	type BatchInfo,
	boxDialogBack,
	sortPeople,
	type Stage,
	STAGE_META,
} from '~/utils/boxes'
import { readyInBox, type ServerPerson } from '~/utils/boxes.server'
import { invariantResponse } from '~/utils/misc'

/**
 * A label and a packing list for a box, or for each of its smaller boxes when
 * it's split and none is open. Like the box page, it lists the people a
 * printer works with (awaiting print or printed); the rest are only counted.
 */
const LISTED: Stage[] = ['print', 'printed']
const NOT_READY: Stage[] = ['review', 'validation', 'returned']

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	const partKey = new URL(request.url).searchParams.get('part')
	const found = await readyInBox(user.id, params.boxId ?? '', partKey)
	invariantResponse(found, 'This box isn’t in your events', { status: 404 })

	const { box } = found
	const groups: Array<{
		key: string
		label: string | null
		batch: BatchInfo | null
		members: ServerPerson[]
	}> = found.part
		? [found.part]
		: box.splitBy
			? found.parts
			: [{ key: '', label: null, batch: null, members: found.scope }]

	const sheets = groups.map(g => ({
		key: g.key,
		part: g.batch
			? [g.batch.group, `Box ${g.batch.index} of ${g.batch.of}`]
					.filter(Boolean)
					.join(' · ')
			: g.label,
		range: g.batch?.range ?? null,
		notReady: g.members.filter(m => NOT_READY.includes(m.stage)).length,
		rows: sortPeople(g.members.filter(m => LISTED.includes(m.stage))).map(
			m => ({
				id: m.id,
				code: m.code,
				name: `${m.familyName.toUpperCase()}, ${m.firstName}`,
				typeName: m.typeName,
				invitationName: m.invitationName,
				stage: m.stage,
			}),
		),
	}))

	return json({
		boxId: box.id,
		boxName: box.name,
		eventName: box.eventName,
		partKey: found.part?.key ?? null,
		// Splitting by invitation already names it on every sheet.
		showInvitation: box.splitBy !== 'INVITATION',
		sheets,
		generatedAt: new Date().toISOString(),
	})
}

type Data = ReturnType<typeof useLoaderData<typeof loader>>
type Sheet = Data['sheets'][number]

const styles = StyleSheet.create({
	label: {
		padding: 48,
		fontFamily: 'Helvetica',
		justifyContent: 'center',
		alignItems: 'center',
		textAlign: 'center',
	},
	labelEvent: { fontSize: 16, color: '#555', marginBottom: 24 },
	labelBox: { fontSize: 48, fontFamily: 'Helvetica-Bold', marginBottom: 16 },
	labelPart: { fontSize: 32, fontFamily: 'Helvetica-Bold', marginBottom: 12 },
	labelRange: { fontSize: 22, marginBottom: 24 },
	labelCount: { fontSize: 20, color: '#333' },
	labelDate: { fontSize: 10, color: '#888', marginTop: 32 },
	list: {
		paddingTop: 36,
		paddingBottom: 48,
		paddingHorizontal: 36,
		fontFamily: 'Helvetica',
		fontSize: 9,
	},
	listTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
	listMeta: { fontSize: 9, color: '#555', marginTop: 2, marginBottom: 10 },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		borderBottomWidth: 0.5,
		borderBottomColor: '#ccc',
		paddingVertical: 4,
	},
	head: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		borderBottomColor: '#000',
		paddingBottom: 3,
		fontFamily: 'Helvetica-Bold',
	},
	tick: { width: 18 },
	tickBox: { width: 9, height: 9, borderWidth: 0.75, borderColor: '#000' },
	num: { width: 24, color: '#555' },
	name: { flex: 3, paddingRight: 6 },
	code: { flex: 1.4, paddingRight: 6 },
	type: { flex: 1.6, paddingRight: 6 },
	invitation: { flex: 2.2, paddingRight: 6 },
	status: { flex: 1.3 },
	muted: { color: '#777' },
	footer: {
		position: 'absolute',
		bottom: 20,
		left: 36,
		right: 36,
		flexDirection: 'row',
		justifyContent: 'space-between',
		fontSize: 8,
		color: '#777',
	},
})

function counts(sheet: Sheet) {
	const printed = sheet.rows.filter(r => r.stage === 'printed').length
	const awaiting = sheet.rows.length - printed
	return {
		total: sheet.rows.length + sheet.notReady,
		printed,
		awaiting,
		notReady: sheet.notReady,
	}
}

function summary(sheet: Sheet) {
	const c = counts(sheet)
	return [
		`${c.total} ${c.total === 1 ? 'person' : 'people'}`,
		`${c.printed} printed`,
		c.awaiting > 0 && `${c.awaiting} awaiting print`,
		c.notReady > 0 && `${c.notReady} not ready yet (not listed)`,
	]
		.filter(Boolean)
		.join(' · ')
}

function SheetPages({
	sheet,
	data,
	generated,
}: {
	sheet: Sheet
	data: Data
	generated: string
}) {
	const c = counts(sheet)
	const title = sheet.part ? `${data.boxName} › ${sheet.part}` : data.boxName
	return (
		<>
			<Page size="A4" orientation="landscape" style={styles.label}>
				<Text style={styles.labelEvent}>{data.eventName}</Text>
				<Text style={styles.labelBox}>{data.boxName}</Text>
				{sheet.part && <Text style={styles.labelPart}>{sheet.part}</Text>}
				{sheet.range && <Text style={styles.labelRange}>{sheet.range}</Text>}
				<Text style={styles.labelCount}>
					{c.total} {c.total === 1 ? 'badge' : 'badges'}
					{c.printed < c.total ? ` (${c.printed} printed so far)` : ''}
				</Text>
				<Text style={styles.labelDate}>Label printed {generated}</Text>
			</Page>
			<Page size="A4" style={styles.list}>
				<Text style={styles.listTitle}>{title}</Text>
				<Text style={styles.listMeta}>
					{[data.eventName, sheet.range, summary(sheet)]
						.filter(Boolean)
						.join(' · ')}
				</Text>
				<View style={styles.head} fixed>
					<Text style={styles.tick}> </Text>
					<Text style={styles.num}>#</Text>
					<Text style={styles.name}>Name</Text>
					<Text style={styles.code}>Code</Text>
					<Text style={styles.type}>Type</Text>
					{data.showInvitation && (
						<Text style={styles.invitation}>Invitation</Text>
					)}
					<Text style={styles.status}>Status</Text>
				</View>
				{sheet.rows.map((r, i) => {
					const inPile = r.stage === 'printed'
					return (
						<View key={r.id} style={styles.row} wrap={false}>
							<View style={styles.tick}>
								{inPile && <View style={styles.tickBox} />}
							</View>
							<Text style={styles.num}>{i + 1}</Text>
							<Text style={[styles.name, inPile ? {} : styles.muted]}>
								{r.name}
							</Text>
							<Text style={styles.code}>{r.code}</Text>
							<Text style={styles.type}>{r.typeName}</Text>
							{data.showInvitation && (
								<Text style={styles.invitation}>{r.invitationName}</Text>
							)}
							<Text style={[styles.status, inPile ? {} : styles.muted]}>
								{STAGE_META[r.stage as Stage].label}
							</Text>
						</View>
					)
				})}
				<View style={styles.footer} fixed>
					<Text>
						{title} · printed {generated}
					</Text>
					<Text
						render={({ subPageNumber, subPageTotalPages }) =>
							`Page ${subPageNumber} of ${subPageTotalPages}`
						}
					/>
				</View>
			</Page>
		</>
	)
}

function ManifestFrame({ data }: { data: Data }) {
	const generated = format(new Date(data.generatedAt), 'd MMM yyyy, HH:mm')
	const pdf = (
		<Document title={`${data.boxName} box sheets`}>
			{data.sheets.map(sheet => (
				<SheetPages
					key={sheet.key}
					sheet={sheet}
					data={data}
					generated={generated}
				/>
			))}
		</Document>
	)
	return (
		<BlobProvider document={pdf}>
			{({ url, loading, error }) =>
				error ? (
					<div className="flex h-full items-center justify-center text-sm text-destructive">
						The box sheets couldn’t be generated. Close and try again.
					</div>
				) : loading || !url ? (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						Generating box sheets…
					</div>
				) : (
					<iframe src={url} title="Box sheets" className="h-full w-full" />
				)
			}
		</BlobProvider>
	)
}

export default function BoxManifestDialog() {
	const data = useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()
	const [isClient, setIsClient] = React.useState(false)
	React.useEffect(() => setIsClient(true), [])
	const sp = new URLSearchParams({ box: data.boxId })
	const part = data.partKey ?? searchParams.get('part')
	if (part) sp.set('part', part)
	const closeTo = boxDialogBack(
		searchParams.get('back'),
		`/printer/boxes?${sp}`,
	)
	const many = data.sheets.length > 1
	const empty = data.sheets.every(s => s.rows.length + s.notReady === 0)
	const awaiting = data.sheets.reduce(
		(n, s) => n + s.rows.filter(r => r.stage === 'print').length,
		0,
	)

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
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
						<ClipboardList className="h-6 w-6" aria-hidden="true" />
					</div>
					<DialogTitle className="text-center">
						{many ? `Box sheets for ${data.sheets.length} boxes` : 'Box sheet'}
					</DialogTitle>
					<DialogDescription className="mx-auto max-w-[65ch] text-center">
						{many
							? 'Each smaller box gets a label for the outside and a packing list to tick off as badges go in.'
							: 'Page 1 is a label for the outside of the box. After it is the packing list to tick off as badges go in.'}
						{awaiting > 0 &&
							` ${awaiting} awaiting print ${awaiting === 1 ? 'is' : 'are'} listed in grey with no tick box, so the box can be checked again once they’re printed.`}
					</DialogDescription>
				</DialogHeader>
				<div className="min-h-0 flex-1">
					{empty ? (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							Nobody in this box yet.
						</div>
					) : (
						isClient && <ManifestFrame data={data} />
					)}
				</div>
				<DialogFooter className="flex-shrink-0">
					<Button asChild variant="outline" className="w-full">
						<Link to={closeTo} preventScrollReset>
							Close
						</Link>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
