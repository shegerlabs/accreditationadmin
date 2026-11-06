// Add one participant type to an event after setup: workflow, badge, staff
// access and quotas for that type only.
// Decision record: docs/decisions/2026-11-06-event-participant-types.md
import { AuditAction, AuditEntityType } from '@prisma/client'
import {
	json,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useLoaderData,
	useNavigation,
	useSearchParams,
} from '@remix-run/react'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import {
	AddTypeSectionEditor,
	TypePicker,
} from '~/components/event-setup/add-type-editors'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { Button } from '~/components/ui/button'
import {
	ADD_TYPE_SECTIONS,
	type AddTypePlan,
	isSectionChanged,
	resetSection,
	sectionSkipReason,
	summarize,
} from '~/utils/add-participant-type'
import {
	applyAddType,
	buildAddTypeDefaults,
	loadAddTypeContext,
	parseAddTypePlan,
} from '~/utils/add-participant-type.server'
import { auditRequest } from '~/utils/audit.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { requireSetupEvent } from '~/utils/event-setup.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { cn, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

/** Adding a type to an event that has no list would make it the event's only type. */
async function requireTypeList(eventId: string) {
	const listed = await prisma.eventParticipantType.count({ where: { eventId } })
	if (listed === 0) throw redirect(`/admin/events/${eventId}/setup`)
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { event } = await requireSetupEvent(request, params.eventId)
	await requireTypeList(event.id)
	const typeId = new URL(request.url).searchParams.get('type')
	const ctx = await loadAddTypeContext(event, typeId)
	const defaults = await buildAddTypeDefaults(ctx, event.tenantId)
	return json({ ctx, defaults })
}

export async function action({ request, params }: ActionFunctionArgs) {
	const { user, event } = await requireSetupEvent(request, params.eventId)
	await requireTypeList(event.id)
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const ctx = await loadAddTypeContext(
		event,
		String(formData.get('typeId') ?? ''),
	)
	if (!ctx.type) {
		return json(
			{
				error:
					'That participant type is already set up for this event, or is not one of the tenant’s types.',
			},
			{ status: 400 },
		)
	}

	let raw: unknown
	try {
		raw = JSON.parse(String(formData.get('plan') ?? ''))
	} catch {
		return json(
			{ error: 'The form was incomplete. Reload the page and try again.' },
			{ status: 400 },
		)
	}
	const parsed = parseAddTypePlan(raw)
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Some values are invalid.' },
			{ status: 400 },
		)
	}

	const result = await applyAddType(parsed.data, event, ctx.type)

	const done = [
		result.listed && 'added to the event',
		result.workflow && 'workflow',
		result.badge && 'badge template',
		`${result.access} access row(s)`,
		`${result.quotas} quota(s)`,
		`${result.invitationQuotas} invitation quota(s)`,
	].filter(Boolean)
	await auditRequest({
		request,
		action: AuditAction.UPDATE,
		entityType: AuditEntityType.EVENT,
		entityId: event.id,
		description: `Set up participant type "${ctx.type.name}" for "${event.name}": ${done.join(', ')}`,
		userId: user.id,
		tenantId: event.tenantId,
		metadata: {
			eventId: event.id,
			participantTypeId: ctx.type.id,
			...result,
		},
	})

	const hasWorkflow = result.workflow || ctx.existing.workflow
	return redirectWithToast(`/admin/events/${event.id}`, {
		type: 'success',
		title: `${ctx.type.name} set up`,
		description: hasWorkflow
			? 'Focal points can now register this type.'
			: 'It has no workflow yet, so the portal won’t offer it until it does.',
	})
}

export default function AddParticipantTypeRoute() {
	const { ctx, defaults } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const [, setSearchParams] = useSearchParams()
	const navigation = useNavigation()
	const isPending = useIsPending()
	const isLoadingType = navigation.state === 'loading'
	const [plan, setPlan] = useState<AddTypePlan>(defaults)
	const [i, setI] = useState(ctx.type ? 1 : 0)
	const [seen, setSeen] = useState(i)

	// A different type has different defaults; start its plan over.
	const typeId = ctx.type?.id
	useEffect(() => {
		setPlan(defaults)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [typeId])

	const go = (n: number) => {
		setI(n)
		setSeen(s => Math.max(s, n))
		window.scrollTo({ top: 0 })
	}
	const total = ADD_TYPE_SECTIONS.length + 2
	const section = i > 0 ? ADD_TYPE_SECTIONS[i - 1] : undefined
	const isConfirm = i === total - 1
	const skipReason = section ? sectionSkipReason(ctx, section.key) : null
	const summary = summarize(ctx, plan)

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-4">
				<div className="min-w-0">
					<p className="text-sm text-muted-foreground">
						Add a participant type
					</p>
					<h1 className="truncate text-xl font-semibold">{ctx.event.name}</h1>
				</div>
				<Button asChild variant="outline" size="sm">
					<Link to={`/admin/events/${ctx.event.id}`}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to event
					</Link>
				</Button>
			</div>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<section
					className="min-w-0 rounded-lg border bg-card"
					aria-labelledby="add-type-step-title"
				>
					<header className="border-b px-6 py-4">
						<div className="mb-3 flex gap-1" aria-hidden>
							{Array.from({ length: total }, (_, n) => (
								<span
									key={n}
									className={cn(
										'h-1 flex-1 rounded-full',
										n <= i ? 'bg-primary' : 'bg-muted',
									)}
								/>
							))}
						</div>
						<p className="text-xs tabular-nums text-muted-foreground">
							Step {i + 1} of {total}
						</p>
						<h2 id="add-type-step-title" className="text-lg font-semibold">
							{i === 0
								? 'Participant type'
								: section
									? section.title
									: 'Confirm'}
						</h2>
						<p className="text-sm text-muted-foreground">
							{i === 0
								? 'Which type to add to this event, or finish setting up.'
								: section
									? section.help
									: 'Check the summary on the right, then create everything in one go.'}
						</p>
					</header>

					<div className="px-6 py-5">
						{i === 0 ? (
							<TypePicker
								ctx={ctx}
								disabled={isLoadingType}
								onPick={id => setSearchParams({ type: id }, { replace: true })}
							/>
						) : section ? (
							skipReason ? (
								<p className="text-sm text-muted-foreground">
									{skipReason} This wizard leaves it alone.
								</p>
							) : (
								<AddTypeSectionEditor
									section={section.key}
									ctx={ctx}
									plan={plan}
									setPlan={setPlan}
								/>
							)
						) : (
							<div className="flex flex-col gap-4">
								<p className="max-w-prose text-sm">
									This adds <strong>{ctx.type?.name}</strong> to the event and
									creates what the summary lists. The event&rsquo;s other
									participant types aren&rsquo;t touched.
								</p>
								{!plan.workflow && !ctx.existing.workflow && (
									<p className="max-w-prose text-sm text-amber-700 dark:text-amber-300">
										No workflow is chosen, so the portal won&rsquo;t offer this
										type yet.
									</p>
								)}
								{actionData?.error && (
									<p
										role="alert"
										className="text-sm font-medium text-destructive"
									>
										{actionData.error}
									</p>
								)}
							</div>
						)}
					</div>

					<footer className="flex items-center justify-between gap-3 border-t px-6 py-4">
						<Button
							type="button"
							variant="ghost"
							disabled={i === 0 || isPending}
							onClick={() => go(i - 1)}
						>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back
						</Button>
						{!isConfirm ? (
							<Button
								type="button"
								disabled={!ctx.type || isLoadingType}
								onClick={() => go(i + 1)}
								className="active:scale-[0.97]"
							>
								Continue
							</Button>
						) : (
							<Form method="POST">
								<AuthenticityTokenInput />
								<HoneypotInputs />
								<input type="hidden" name="typeId" value={ctx.type?.id ?? ''} />
								<input type="hidden" name="plan" value={JSON.stringify(plan)} />
								<Button
									type="submit"
									disabled={isPending || !ctx.type}
									className="active:scale-[0.97]"
								>
									{isPending ? 'Saving…' : `Add ${ctx.type?.name ?? 'type'}`}
								</Button>
							</Form>
						)}
					</footer>
				</section>

				<aside
					className="lg:sticky lg:top-4 lg:self-start"
					aria-label="What will be created"
				>
					<div className="rounded-lg border bg-card">
						<h3 className="border-b px-4 py-3 text-sm font-semibold">
							Will be created
						</h3>
						<ol className="divide-y">
							<li
								className={cn(
									'flex items-center justify-between gap-2 px-4 py-3',
									i === 0 && 'bg-muted/50',
								)}
							>
								<button
									type="button"
									disabled={isPending}
									onClick={() => go(0)}
									aria-current={i === 0 ? 'step' : undefined}
									className="rounded-sm text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									Participant type
								</button>
								<span className="truncate text-xs text-muted-foreground">
									{ctx.type?.name ?? 'Not picked'}
								</span>
							</li>
							{ctx.type &&
								ADD_TYPE_SECTIONS.map((sec, n) => {
									const step = n + 1
									const skipped = sectionSkipReason(ctx, sec.key)
									const isChanged =
										!skipped && isSectionChanged(plan, defaults, sec.key)
									return (
										<li
											key={sec.key}
											className={cn(
												'flex flex-col gap-1 px-4 py-3',
												step === i && 'bg-muted/50',
											)}
										>
											<div className="flex items-center justify-between gap-2">
												<button
													type="button"
													disabled={isPending}
													onClick={() => go(step)}
													aria-current={step === i ? 'step' : undefined}
													className="rounded-sm text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												>
													{sec.title}
												</button>
												{skipped ? (
													<span className="text-xs text-muted-foreground">
														{sec.key === 'quotas'
															? 'Nothing to add'
															: 'Already set up'}
													</span>
												) : isChanged ? (
													<span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
														Changed
													</span>
												) : (
													<span className="text-xs text-muted-foreground">
														{step <= seen ? 'Default' : 'Not reviewed'}
													</span>
												)}
											</div>
											{!skipped && (
												<p className="text-xs text-muted-foreground">
													{summary[sec.key]}
												</p>
											)}
											{isChanged && (
												<button
													type="button"
													onClick={() =>
														setPlan(p => resetSection(p, defaults, sec.key))
													}
													className="flex items-center gap-1 self-start rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												>
													<RotateCcw className="h-3 w-3" aria-hidden />
													Reset to default
												</button>
											)}
										</li>
									)
								})}
						</ol>
					</div>
				</aside>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => (
					<ErrorDisplay
						title="Event Not Found"
						message="The event you're looking for does not exist."
						redirectUrl="/admin/events"
						errorCode={404}
					/>
				),
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You don't have permission to change this event."
						redirectUrl="/admin/events"
						errorCode={403}
					/>
				),
				409: () => (
					<ErrorDisplay
						title="Event Closed"
						message="This event is closed. Reopen it before changing its setup."
						redirectUrl="/admin/events"
						errorCode={409}
					/>
				),
			}}
		/>
	)
}
