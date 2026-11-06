// Event setup wizard: every per-event configuration in one pass.
// Decision record: docs/decisions/2026-11-06-event-setup-wizard.md
import { AuditAction, AuditEntityType } from '@prisma/client'
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { SectionEditor } from '~/components/event-setup/editors'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { Button } from '~/components/ui/button'
import { auditRequest } from '~/utils/audit.server'
import { requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import {
	SETUP_SECTIONS,
	isSectionChanged,
	resetSection,
	sectionSkipReason,
	summarizePlan,
	type SetupPlan,
} from '~/utils/event-setup'
import {
	applySetup,
	buildDefaultPlan,
	loadSetupContext,
	parsePlan,
} from '~/utils/event-setup.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { cn, invariantResponse, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

async function requireSetupEvent(
	request: Request,
	eventId: string | undefined,
) {
	const user = await requireAdminAccess(request)
	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			name: true,
			status: true,
			tenantId: true,
			deletedAt: true,
		},
	})
	invariantResponse(event && !event.deletedAt, 'Not Found', { status: 404 })
	if (!user.isGlobalAdmin && event.tenantId !== user.tenantId) {
		throw json({ message: 'Access denied' }, { status: 403 })
	}
	if (event.status === 'COMPLETED') {
		throw json(
			{ message: 'This event is closed. Reopen it before changing its setup.' },
			{ status: 409 },
		)
	}
	return { user, event }
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { event } = await requireSetupEvent(request, params.eventId)
	const ctx = await loadSetupContext(event)
	const defaults = await buildDefaultPlan(ctx, event)
	return json({ ctx, defaults })
}

export async function action({ request, params }: ActionFunctionArgs) {
	const { user, event } = await requireSetupEvent(request, params.eventId)
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	let raw: unknown
	try {
		raw = JSON.parse(String(formData.get('plan') ?? ''))
	} catch {
		return json(
			{
				error: 'The setup form was incomplete. Reload the page and try again.',
			},
			{ status: 400 },
		)
	}
	const parsed = parsePlan(raw)
	if (!parsed.success) {
		return json(
			{
				error:
					parsed.error.issues[0]?.message ?? 'Some setup values are invalid.',
			},
			{ status: 400 },
		)
	}

	const result = await applySetup(parsed.data, event, user.id)

	await auditRequest({
		request,
		action: AuditAction.UPDATE,
		entityType: AuditEntityType.EVENT,
		entityId: event.id,
		description:
			`Ran event setup for "${event.name}": ${result.restrictions} restriction(s), ${result.constraints} quota(s), ` +
			`${result.workflows} workflow(s), ${result.badges} badge template(s), ${result.emails} custom email(s), ` +
			`${result.access} access row(s)`,
		userId: user.id,
		tenantId: event.tenantId,
		metadata: { eventId: event.id, ...result },
	})

	return redirectWithToast(`/admin/events/${event.id}`, {
		type: 'success',
		title: 'Event set up',
		description: `Created ${result.workflows} workflows, ${result.badges} badge templates and ${result.access} staff assignments. Add invitations next.`,
	})
}

export default function EventSetupRoute() {
	const { ctx, defaults } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const [plan, setPlan] = useState<SetupPlan>(defaults)
	const [i, setI] = useState(0)
	const [seen, setSeen] = useState(0)
	const isPending = useIsPending()
	const summary = summarizePlan(ctx, plan)
	const step = SETUP_SECTIONS[i]
	const go = (n: number) => {
		setI(n)
		setSeen(s => Math.max(s, n))
		window.scrollTo({ top: 0 })
	}
	const active = SETUP_SECTIONS.filter(s => !sectionSkipReason(ctx, s.key))
	const changed = active.filter(s => isSectionChanged(plan, defaults, s.key))
	const skipReason = step ? sectionSkipReason(ctx, step.key) : null

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-4">
				<div className="min-w-0">
					<p className="text-sm text-muted-foreground">Set up event</p>
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
					aria-labelledby="setup-step-title"
				>
					<header className="border-b px-6 py-4">
						<div className="mb-3 flex gap-1" aria-hidden>
							{[...SETUP_SECTIONS, null].map((_, n) => (
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
							Step {i + 1} of {SETUP_SECTIONS.length + 1}
						</p>
						<h2 id="setup-step-title" className="text-lg font-semibold">
							{step ? step.title : 'Confirm'}
						</h2>
						<p className="text-sm text-muted-foreground">
							{step
								? step.help
								: 'Check the summary on the right, then create everything in one go.'}
						</p>
					</header>

					<div className="px-6 py-5">
						{step ? (
							skipReason ? (
								<p className="text-sm text-muted-foreground">
									{skipReason} Setup leaves this section alone.
								</p>
							) : (
								<SectionEditor
									section={step.key}
									ctx={ctx}
									plan={plan}
									setPlan={setPlan}
								/>
							)
						) : (
							<div className="flex flex-col gap-4">
								<p className="max-w-prose text-sm">
									{changed.length === 0
										? 'You kept every default.'
										: `You changed ${changed.length} of ${active.length} sections from the defaults: ${changed
												.map(c => c.title.toLowerCase())
												.join(', ')}.`}
								</p>
								<p className="max-w-prose text-sm text-muted-foreground">
									Invitations aren&rsquo;t part of setup: each one is an
									organization&rsquo;s focal point, so there is no default list.
									Add or import them on the Invitations tab afterwards. They
									draw on the restrictions created here.
								</p>
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
						{step ? (
							<Button
								type="button"
								onClick={() => go(i + 1)}
								className="active:scale-[0.97]"
							>
								Continue
							</Button>
						) : (
							<Form method="POST">
								<AuthenticityTokenInput />
								<HoneypotInputs />
								<input type="hidden" name="plan" value={JSON.stringify(plan)} />
								<Button
									type="submit"
									disabled={isPending || active.length === 0}
									className="active:scale-[0.97]"
								>
									{isPending ? 'Setting up…' : 'Set up event'}
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
							{SETUP_SECTIONS.map((sec, n) => {
								const skipped = sectionSkipReason(ctx, sec.key)
								const isChanged =
									!skipped && isSectionChanged(plan, defaults, sec.key)
								return (
									<li
										key={sec.key}
										className={cn(
											'flex flex-col gap-1 px-4 py-3',
											n === i && 'bg-muted/50',
										)}
									>
										<div className="flex items-center justify-between gap-2">
											<button
												type="button"
												disabled={isPending}
												onClick={() => go(n)}
												aria-current={n === i ? 'step' : undefined}
												className="rounded-sm text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												{sec.title}
											</button>
											{skipped ? (
												<span className="text-xs text-muted-foreground">
													Already set up
												</span>
											) : isChanged ? (
												<span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
													Changed
												</span>
											) : (
												<span className="text-xs text-muted-foreground">
													{n <= seen ? 'Default' : 'Not reviewed'}
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
							<li className="px-4 py-3 text-xs text-muted-foreground">
								Invitations: after setup
							</li>
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
						message="You don't have permission to set up this event."
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
