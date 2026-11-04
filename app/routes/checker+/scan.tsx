import { LoaderFunctionArgs } from '@remix-run/node'
import { Link, useFetcher } from '@remix-run/react'
import {
	CheckCircle2,
	AlertCircle,
	AlertTriangle,
	User,
	Search,
	History,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { QrScannerClient } from '~/components/qr-scanner-client'
import { Card, CardContent } from '~/components/ui/card'
import { requireUserWithRoles } from '~/utils/auth.server'
import { getParticipantDocumentFileSrc } from '~/utils/misc'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['checkpoint'])
	return null
}

interface ValidParticipant {
	id: string
	titleName: string
	firstName: string
	familyName: string
	gender: string
	organization: string
	jobTitle: string
	registrationCode: string
	status: string
	email: string | null
	telephone: string | null
	attendClosedSession: boolean
	attendExecutiveCouncilClosedSession: boolean
	countryName: string
	nationalityName: string
	participantTypeName: string
	eventName: string
	photoId: string | null
}

type ValidateResult =
	| {
			ok: true
			participant: ValidParticipant
			duplicateWarning: string | null
	  }
	| { ok: false; error: string }

interface SearchResult {
	id: string
	firstName: string
	familyName: string
	registrationCode: string
	organization: string
	participantTypeName: string
	eventName: string
}

// --- Sound feedback via Web Audio API ---
function playBeep(frequency: number, duration: number, type: OscillatorType = 'sine') {
	try {
		const ctx = new AudioContext()
		const oscillator = ctx.createOscillator()
		const gain = ctx.createGain()
		oscillator.type = type
		oscillator.frequency.value = frequency
		gain.gain.value = 0.3
		oscillator.connect(gain)
		gain.connect(ctx.destination)
		oscillator.start()
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000)
		oscillator.stop(ctx.currentTime + duration / 1000)
	} catch {
		// Audio not supported
	}
}

function feedbackValid() {
	playBeep(880, 150)
	navigator.vibrate?.(100)
}

function feedbackInvalid() {
	playBeep(300, 300, 'square')
	navigator.vibrate?.([100, 50, 200])
}

function feedbackDuplicate() {
	playBeep(600, 150)
	setTimeout(() => playBeep(600, 150), 200)
	navigator.vibrate?.([80, 60, 80])
}

export default function CheckpointScan() {
	const fetcher = useFetcher<ValidateResult>()
	const searchFetcher = useFetcher<{ results: SearchResult[] }>()
	const [latestResult, setLatestResult] = useState<ValidateResult | null>(null)
	const [overlay, setOverlay] = useState<{
		type: 'success' | 'error' | 'duplicate'
		message: string
	} | null>(null)
	const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
	const lastScannedRef = useRef<string>('')
	const lastScannedTimeRef = useRef<number>(0)

	const [searchQuery, setSearchQuery] = useState('')
	const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>()

	// Handle validate response
	useEffect(() => {
		if (fetcher.state !== 'idle' || !fetcher.data) return

		const data = fetcher.data
		setLatestResult(data)

		if (data.ok) {
			if (data.duplicateWarning) {
				feedbackDuplicate()
				const time = new Date(data.duplicateWarning).toLocaleTimeString([], {
					hour: '2-digit',
					minute: '2-digit',
				})
				setOverlay({
					type: 'duplicate',
					message: `Already scanned at ${time}`,
				})
			} else {
				feedbackValid()
				setOverlay({
					type: 'success',
					message: `${data.participant.firstName} ${data.participant.familyName}`,
				})
			}
		} else {
			feedbackInvalid()
			setOverlay({ type: 'error', message: data.error })
		}

		if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current)
		overlayTimeoutRef.current = setTimeout(() => setOverlay(null), 2500)
	}, [fetcher.state, fetcher.data])

	// Handle QR scan
	const handleScan = useCallback(
		(data: string) => {
			if (!data || fetcher.state !== 'idle') return
			const now = Date.now()
			if (
				data === lastScannedRef.current &&
				now - lastScannedTimeRef.current < 5000
			) {
				return
			}
			lastScannedRef.current = data
			lastScannedTimeRef.current = now
			fetcher.load(`/checker/validate?q=${encodeURIComponent(data)}`)
		},
		[fetcher],
	)

	// Manual search with debounce
	const handleSearchInput = (value: string) => {
		setSearchQuery(value)
		if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
		if (value.trim().length < 2) return
		searchDebounceRef.current = setTimeout(() => {
			searchFetcher.load(`/checker/search?q=${encodeURIComponent(value.trim())}`)
		}, 300)
	}

	// Select a search result to validate
	const handleSelectResult = (id: string) => {
		setSearchQuery('')
		fetcher.load(`/checker/validate?q=${encodeURIComponent(id)}`)
	}

	const searchResults = searchFetcher.data?.results ?? []

	return (
		<div className="p-4">
			<Card>
				<CardContent className="flex flex-col gap-0 p-0 md:flex-row">
					{/* Left: Search + Scanner */}
					<div className="shrink-0 p-4 md:w-80 lg:w-96">
						{/* History link */}
						<Link
							to="/checker/history"
							className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-muted-foreground ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
						>
							<History className="h-4 w-4" />
							History
						</Link>
						{/* Search box */}
						<div className="relative mb-3">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<input
								type="text"
								value={searchQuery}
								onChange={e => handleSearchInput(e.target.value)}
								placeholder="Registration code or name..."
								className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
							/>
							{/* Search results dropdown */}
							{searchQuery.trim().length >= 2 && (
								<div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border bg-background shadow-lg">
									{searchFetcher.state !== 'idle' ? (
										<p className="py-3 text-center text-xs text-muted-foreground">
											Searching...
										</p>
									) : searchResults.length > 0 ? (
										<div className="max-h-60 overflow-y-auto py-1">
											{searchResults.map(p => (
												<button
													key={p.id}
													type="button"
													onClick={() => handleSelectResult(p.id)}
													className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
												>
													<div className="min-w-0 flex-1">
														<p className="truncate text-sm font-medium">
															{p.firstName} {p.familyName}
														</p>
														<p className="truncate text-xs text-muted-foreground">
															{p.registrationCode} &middot;{' '}
															{p.participantTypeName} &middot;{' '}
															{p.eventName}
														</p>
													</div>
												</button>
											))}
										</div>
									) : (
										<p className="py-3 text-center text-xs text-muted-foreground">
											No participants found
										</p>
									)}
								</div>
							)}
						</div>
						<div className="relative overflow-hidden rounded-lg">
							<QrScannerClient onScan={handleScan} paused={false} />
							{overlay && (
								<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/50 animate-in fade-in duration-200">
									{overlay.type === 'success' ? (
										<CheckCircle2 className="h-16 w-16 text-green-400" />
									) : overlay.type === 'duplicate' ? (
										<AlertTriangle className="h-16 w-16 text-amber-400" />
									) : (
										<AlertCircle className="h-16 w-16 text-red-400" />
									)}
									<p className="mt-2 max-w-[80%] truncate rounded-full bg-black/60 px-4 py-1.5 text-center text-sm font-medium text-white">
										{overlay.message}
									</p>
								</div>
							)}
						</div>
					</div>

					{/* Right: Latest result */}
					<div className="flex min-h-0 flex-1 flex-col border-t md:border-l md:border-t-0">
						{latestResult ? (
							<div className="p-4">
								{latestResult.ok ? (
									<div>
										{/* Duplicate warning */}
										{latestResult.duplicateWarning && (
											<div className="mb-3 flex items-center gap-2 rounded-lg border-2 border-amber-500 bg-amber-50 px-4 py-2.5 dark:bg-amber-950/30">
												<AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
												<p className="text-sm font-medium text-amber-700 dark:text-amber-400">
													Already scanned at{' '}
													{new Date(
														latestResult.duplicateWarning,
													).toLocaleTimeString([], {
														hour: '2-digit',
														minute: '2-digit',
													})}
												</p>
											</div>
										)}

										<div className="rounded-lg border-2 border-green-500 bg-green-50 p-4 dark:bg-green-950/30">
											<div className="mb-3 flex items-center gap-2">
												<CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
												<span className="text-sm font-semibold uppercase text-green-700 dark:text-green-400">
													Valid
												</span>
											</div>

											<div className="flex gap-4">
												{/* Photo */}
												<div className="h-48 w-36 shrink-0 overflow-hidden rounded-lg border-2 border-green-300 bg-muted shadow-sm md:h-56 md:w-44 dark:border-green-700">
													{latestResult.participant.photoId ? (
														<img
															src={getParticipantDocumentFileSrc(
																latestResult.participant.photoId,
															)}
															alt={`${latestResult.participant.firstName} ${latestResult.participant.familyName}`}
															className="h-full w-full object-cover"
														/>
													) : (
														<div className="flex h-full w-full items-center justify-center">
															<User className="h-14 w-14 text-muted-foreground" />
														</div>
													)}
												</div>

												{/* Details */}
												<div className="relative min-w-0 flex-1 space-y-1.5">
													{/* Session badge */}
													<span className="absolute right-0 top-0 rounded-2xl bg-red-600 px-7 py-4 text-5xl font-black leading-none text-white shadow-lg dark:bg-red-700">
														{latestResult.participant.attendExecutiveCouncilClosedSession
															? 'CX'
															: latestResult.participant.attendClosedSession
																? 'C'
																: 'O'}
													</span>
													<p className="text-lg font-bold">
														{latestResult.participant.titleName && (
															<span className="text-muted-foreground">
																{latestResult.participant.titleName}{' '}
															</span>
														)}
														{latestResult.participant.firstName}{' '}
														{latestResult.participant.familyName}
													</p>

													<dl className="space-y-1 text-sm">
														<div className="flex gap-1">
															<dt className="shrink-0 text-muted-foreground">Code:</dt>
															<dd className="font-medium">{latestResult.participant.registrationCode}</dd>
														</div>
														<div className="flex gap-1">
															<dt className="shrink-0 text-muted-foreground">Type:</dt>
															<dd className="font-medium">{latestResult.participant.participantTypeName}</dd>
														</div>
														{latestResult.participant.jobTitle && (
															<div className="flex gap-1">
																<dt className="shrink-0 text-muted-foreground">Title:</dt>
																<dd className="font-medium">{latestResult.participant.jobTitle}</dd>
															</div>
														)}
														{latestResult.participant.organization && (
															<div className="flex gap-1">
																<dt className="shrink-0 text-muted-foreground">Org:</dt>
																<dd className="font-medium">{latestResult.participant.organization}</dd>
															</div>
														)}
														{latestResult.participant.countryName && (
															<div className="flex gap-1">
																<dt className="shrink-0 text-muted-foreground">Country:</dt>
																<dd className="font-medium">{latestResult.participant.countryName}</dd>
															</div>
														)}
														{latestResult.participant.nationalityName && (
															<div className="flex gap-1">
																<dt className="shrink-0 text-muted-foreground">Nationality:</dt>
																<dd className="font-medium">{latestResult.participant.nationalityName}</dd>
															</div>
														)}
														<div className="flex gap-1">
															<dt className="shrink-0 text-muted-foreground">Event:</dt>
															<dd className="font-medium">{latestResult.participant.eventName}</dd>
														</div>
															{latestResult.participant.email && (
															<div className="flex gap-1">
																<dt className="shrink-0 text-muted-foreground">Email:</dt>
																<dd className="truncate font-medium">{latestResult.participant.email}</dd>
															</div>
														)}
														{latestResult.participant.telephone && (
															<div className="flex gap-1">
																<dt className="shrink-0 text-muted-foreground">Phone:</dt>
																<dd className="font-medium">{latestResult.participant.telephone}</dd>
															</div>
														)}
													</dl>
												</div>
											</div>
										</div>
									</div>
								) : (
									<div className="rounded-lg border-2 border-red-500 bg-red-50 p-4 dark:bg-red-950/30">
										<div className="flex items-center gap-3">
											<AlertCircle className="h-8 w-8 shrink-0 text-red-600 dark:text-red-400" />
											<div>
												<p className="text-sm font-semibold uppercase text-red-700 dark:text-red-400">
													Invalid
												</p>
												<p className="text-sm text-red-600 dark:text-red-300">
													{latestResult.error}
												</p>
											</div>
										</div>
									</div>
								)}
							</div>
						) : (
							<div className="flex flex-1 items-center justify-center p-8 text-center">
								<p className="text-sm text-muted-foreground">
									Point the camera at a badge QR code to begin
								</p>
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
