import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Action, AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import {
	Form,
	useActionData,
	useFetcher,
	useNavigate,
	useSearchParams,
} from '@remix-run/react'
import {
	AlertCircle,
	ArrowLeft,
	ChevronDown,
	ChevronUp,
	CheckCircle2,
	PackageCheck,
	Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { InputField } from '~/components/conform/InputField'
import { TextareaField } from '~/components/conform/TextareaField'
import { QrScannerClient } from '~/components/qr-scanner-client'
import { Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Label } from '~/components/ui/label'
import { auditRequest } from '~/utils/audit.server'
import {
	getUserAccessibleStepIds,
	requireUserWithRoles,
} from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import { processParticipant } from '~/utils/workflow.server'
import { BulkCollectSchema } from './bulk-collect'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['dispatcher'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: BulkCollectSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { participantIds, collectedBy, collectedByPhone, collectionNotes } =
		submission.value

	const ids = participantIds.split(',').filter(Boolean)

	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['dispatcher'])

	const participants = await prisma.participant.findMany({
		where: {
			id: { in: ids },
			stepId: { in: accessibleStepIds },
			status: 'PRINTED',
		},
		select: {
			id: true,
			firstName: true,
			familyName: true,
			email: true,
			organization: true,
			status: true,
			tenantId: true,
			step: {
				select: {
					id: true,
					name: true,
					nextStepId: true,
					workflow: {
						select: {
							id: true,
							name: true,
							event: {
								select: { id: true, name: true },
							},
						},
					},
				},
			},
			participantType: {
				select: { id: true, name: true },
			},
		},
	})

	if (participants.length === 0) {
		return json(
			{
				result: submission.reply({
					formErrors: ['No valid participants found for collection'],
				}),
			},
			{ status: 400 },
		)
	}

	const collectedAt = new Date()
	const remarks = `Badge collected by ${collectedBy}${collectedByPhone ? ` (${collectedByPhone})` : ''}${collectionNotes ? ` - ${collectionNotes}` : ''}`

	for (const participant of participants) {
		await prisma.participant.update({
			where: { id: participant.id },
			data: {
				collectedBy,
				collectedByPhone: collectedByPhone || null,
				collectionNotes: collectionNotes || null,
				collectedAt,
			},
		})

		await processParticipant(participant.id, user.id, Action.COLLECT, remarks)

		const nextStep = participant.step.nextStepId
			? await prisma.step.findUnique({
					where: { id: participant.step.nextStepId },
					select: { id: true, name: true },
				})
			: null

		await auditRequest({
			request,
			action: AuditAction.COLLECT,
			entityType: AuditEntityType.PARTICIPANT,
			entityId: participant.id,
			description: `Badge collected for ${participant.firstName} ${participant.familyName} by ${collectedBy} (scan collection)`,
			userId: user.id,
			tenantId: participant.tenantId,
			metadata: {
				beforeState: {
					stepId: participant.step.id,
					stepName: participant.step.name,
					status: participant.status,
				},
				afterState: {
					stepId: nextStep?.id,
					stepName: nextStep?.name || 'Completed',
					status: 'COLLECTED',
				},
				participant: {
					id: participant.id,
					name: `${participant.firstName} ${participant.familyName}`,
					email: participant.email,
					organization: participant.organization,
					type: participant.participantType.name,
				},
				collection: {
					collectedBy,
					collectedByPhone,
					collectionNotes,
					collectedAt: collectedAt.toISOString(),
					scanCollection: true,
				},
				event: {
					id: participant.step.workflow.event.id,
					name: participant.step.workflow.event.name,
				},
				workflow: {
					id: participant.step.workflow.id,
					name: participant.step.workflow.name,
				},
			},
		})
	}

	const url = new URL(request.url)
	const redirectParams = new URLSearchParams(url.searchParams)
	const redirectUrl = `/dispatcher/requests${redirectParams.size ? '?' + redirectParams.toString() : ''}`

	return redirectWithToast(redirectUrl, {
		type: 'success',
		title: 'Badges Collected',
		description: `${participants.length} badge(s) marked as collected by ${collectedBy}.`,
	})
}

interface ScannedParticipant {
	id: string
	firstName: string
	familyName: string
	organization: string
	participantTypeName: string
}


export default function ScanCollectDialog() {
	const navigate = useNavigate()
	const [searchParams] = useSearchParams()
	const paramsSuffix = searchParams.size ? '?' + searchParams.toString() : ''
	const actionData = useActionData<typeof action>()
	const fetcher = useFetcher<{
		ok: boolean
		error?: string
		participant?: ScannedParticipant
	}>()

	const [phase, setPhase] = useState<'scanning' | 'collecting'>('scanning')
	const [scannedParticipants, setScannedParticipants] = useState<ScannedParticipant[]>([])
	const [listExpanded, setListExpanded] = useState(false)
	const [overlay, setOverlay] = useState<{
		type: 'success' | 'error'
		message: string
	} | null>(null)
	const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

	const participantIds = scannedParticipants.map(p => p.id).join(',')

	const [form, fields] = useForm({
		id: 'scan-collect-form',
		constraint: getZodConstraint(BulkCollectSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: BulkCollectSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			participantIds: '',
			collectedBy: '',
			collectedByPhone: '',
			collectionNotes: '',
		},
	})

	// Handle fetcher response
	useEffect(() => {
		if (fetcher.state !== 'idle' || !fetcher.data) return

		const data = fetcher.data
		if (data.ok && data.participant) {
			setScannedParticipants(prev => {
				if (prev.some(p => p.id === data.participant!.id)) {
					return prev
				}
				return [...prev, data.participant!]
			})
			setOverlay({
				type: 'success',
				message: `${data.participant.firstName} ${data.participant.familyName}`,
			})
		} else if (!data.ok && data.error) {
			setOverlay({ type: 'error', message: data.error })
		}

		if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current)
		overlayTimeoutRef.current = setTimeout(() => setOverlay(null), 2000)
	}, [fetcher.state, fetcher.data])

	const handleScan = useCallback(
		(data: string) => {
			if (!data || fetcher.state !== 'idle') return
			fetcher.load(`/dispatcher/requests/validate-scan?q=${encodeURIComponent(data)}`)
		},
		[fetcher],
	)

	const removeParticipant = (id: string) => {
		setScannedParticipants(prev => prev.filter(p => p.id !== id))
	}

	const handleCancel = () => {
		navigate(`/dispatcher/requests${paramsSuffix}`)
	}

	return (
		<Dialog
			open={true}
			onOpenChange={() => handleCancel()}
		>
			<DialogContent
				className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg"
				onEscapeKeyDown={e => {
					e.preventDefault()
					handleCancel()
				}}
				onPointerDownOutside={e => e.preventDefault()}
				onInteractOutside={e => e.preventDefault()}
			>
				{phase === 'scanning' ? (
					<>
						<DialogHeader className="shrink-0">
							<DialogTitle className="text-center">
								Scan to Collect
							</DialogTitle>
							<DialogDescription className="text-center">
								Scan badge QR codes to add them to the collection list.
							</DialogDescription>
						</DialogHeader>

						<div className="min-h-0 flex-1 overflow-y-auto">
							<div className="space-y-3">
								{/* QR Scanner with overlay feedback */}
								<div className="relative overflow-hidden rounded-lg">
									<QrScannerClient
										onScan={handleScan}
										paused={phase !== 'scanning'}
									/>
									{overlay && (
										<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/50 animate-in fade-in duration-200">
											{overlay.type === 'success' ? (
												<CheckCircle2 className="h-16 w-16 text-green-400" />
											) : (
												<AlertCircle className="h-16 w-16 text-red-400" />
											)}
											<p className="mt-2 max-w-[80%] truncate rounded-full bg-black/60 px-4 py-1.5 text-center text-sm font-medium text-white">
												{overlay.message}
											</p>
										</div>
									)}
								</div>

								{/* Scanned participants list (collapsible) */}
								{scannedParticipants.length > 0 && (
									<div className="rounded-md border">
										<button
											type="button"
											onClick={() => setListExpanded(prev => !prev)}
											className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50"
										>
											<span>
												{scannedParticipants.length} badge(s) scanned
											</span>
											{listExpanded ? (
												<ChevronUp className="h-4 w-4 text-muted-foreground" />
											) : (
												<ChevronDown className="h-4 w-4 text-muted-foreground" />
											)}
										</button>
										{listExpanded && (
											<div className="max-h-40 overflow-y-auto border-t">
												<div className="divide-y">
													{scannedParticipants.map(p => (
														<div
															key={p.id}
															className="flex items-center justify-between px-3 py-2"
														>
															<div className="min-w-0 flex-1">
																<p className="truncate text-sm font-medium">
																	{p.firstName} {p.familyName}
																</p>
																<p className="truncate text-xs text-muted-foreground">
																	{p.organization} &middot; {p.participantTypeName}
																</p>
															</div>
															<Button
																type="button"
																variant="ghost"
																size="sm"
																onClick={() => removeParticipant(p.id)}
																className="ml-2 h-8 w-8 shrink-0 p-0"
															>
																<Trash2 className="h-4 w-4 text-muted-foreground" />
															</Button>
														</div>
													))}
												</div>
											</div>
										)}
									</div>
								)}
							</div>
						</div>

						<DialogFooter className="shrink-0 gap-2 sm:gap-0">
							<Button type="button" variant="outline" onClick={handleCancel}>
								Cancel
							</Button>
							<Button
								type="button"
								disabled={scannedParticipants.length === 0}
								onClick={() => setPhase('collecting')}
							>
								<PackageCheck className="mr-2 h-4 w-4" />
								Collect ({scannedParticipants.length})
							</Button>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader className="shrink-0">
							<DialogTitle className="text-center">
								Collection Details
							</DialogTitle>
							<DialogDescription className="text-center">
								Enter the details of the person collecting{' '}
								<span className="font-semibold">
									{scannedParticipants.length} badge(s)
								</span>
								.
							</DialogDescription>
						</DialogHeader>
						<Form
							method="POST"
							{...getFormProps(form)}
							className="flex min-h-0 flex-1 flex-col overflow-hidden"
						>
							<AuthenticityTokenInput />
							<HoneypotInputs />
							<input
								type="hidden"
								name={fields.participantIds.name}
								value={participantIds}
							/>

							<div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
								<Field>
									<Label htmlFor={fields.collectedBy.id}>
										Collected By <span className="text-destructive">*</span>
									</Label>
									<InputField
										meta={fields.collectedBy}
										type="text"
										placeholder="Name of person collecting"
										autoFocus
									/>
									{fields.collectedBy.errors && (
										<FieldError>{fields.collectedBy.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.collectedByPhone.id}>
										Phone Number
									</Label>
									<InputField
										meta={fields.collectedByPhone}
										type="tel"
										placeholder="Contact phone (optional)"
									/>
									{fields.collectedByPhone.errors && (
										<FieldError>
											{fields.collectedByPhone.errors}
										</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.collectionNotes.id}>Notes</Label>
									<TextareaField
										meta={fields.collectionNotes}
										placeholder="Additional notes (optional)"
										rows={2}
									/>
									{fields.collectionNotes.errors && (
										<FieldError>
											{fields.collectionNotes.errors}
										</FieldError>
									)}
								</Field>
							</div>

							<DialogFooter className="shrink-0 gap-2 sm:gap-0">
								<Button
									type="button"
									variant="outline"
									onClick={() => setPhase('scanning')}
								>
									<ArrowLeft className="mr-2 h-4 w-4" />
									Back
								</Button>
								<Button type="submit">
									<PackageCheck className="mr-2 h-4 w-4" />
									Confirm ({scannedParticipants.length})
								</Button>
							</DialogFooter>
						</Form>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}
