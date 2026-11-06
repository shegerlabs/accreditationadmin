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
import { validateCSRF } from '~/utils/csrf.server'
import {
	SETUP_SECTIONS,
	isSectionChanged,
	summarizeEdit,
	planProblems,
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
	requireSetupEvent,
} from '~/utils/event-setup.server'
import {
	type EditResult,
	SetupEditError,
	applySetupEdit,
	buildSavedPlan,
	planVersion,
} from '~/utils/event-setup-edit.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { cn, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { event } = await requireSetupEvent(request, params.eventId)
	const ctx = await loadSetupContext(event)
	// Editing a draft compares against, and resets to, what is saved.
	const defaults =
		ctx.mode === 'edit'
			? await buildSavedPlan(ctx, event)
			: await buildDefaultPlan(ctx, event)
	const version = ctx.mode === 'edit' ? planVersion(defaults) : ''
	return json({ ctx, defaults, version })
}

const EDIT_LABELS = {
	typesAdded: 'type(s) added',
	typesRemoved: 'type(s) removed',
	restrictionsAdded: 'restriction(s) added',
	restrictionsChanged: 'restriction(s) changed',
	restrictionsRemoved: 'restriction(s) removed',
	invitationsAdded: 'invitation(s) added',
	invitationsChanged: 'invitation(s) changed',
	invitationsRemoved: 'invitation(s) removed',
	workflowsAdded: 'workflow(s) added',
	workflowsReplaced: 'workflow(s) replaced',
	workflowsRemoved: 'workflow(s) removed',
	badgesAdded: 'badge template(s) added',
	badgesChanged: 'badge template(s) changed',
	badgesRemoved: 'badge template(s) removed',
	emails: 'email(s) changed',
	accessChanged: "staff member(s)' step changed",
	accessRows: 'access row(s) created',
} satisfies Record<keyof EditResult, string>

const STALE =
	"This event's setup changed since you opened this page. Reload it to see the current setup, then make your changes again."

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

	const ctx = await loadSetupContext(event)
	if ((formData.get('mode') ?? 'create') !== ctx.mode)
		return json({ error: STALE }, { status: 409 })

	const problem = planProblems(ctx, parsed.data)[0]
	if (problem) return json({ error: problem }, { status: 400 })

	if (ctx.mode === 'edit') {
		const saved = await buildSavedPlan(ctx, event)
		if (formData.get('version') !== planVersion(saved))
			return json({ error: STALE }, { status: 409 })
		let result
		try {
			result = await applySetupEdit(parsed.data, saved, ctx, event, user.id)
		} catch (error) {
			if (error instanceof SetupEditError)
				return json({ error: error.message }, { status: 400 })
			throw error
		}
		const changes = Object.entries(result)
			.filter(([, n]) => n > 0)
			.map(([k, n]) => `${n} ${EDIT_LABELS[k as keyof typeof result]}`)
		await auditRequest({
			request,
			action: AuditAction.UPDATE,
			entityType: AuditEntityType.EVENT,
			entityId: event.id,
			description: `Edited the setup of draft event "${event.name}": ${changes.join(', ') || 'no changes'}`,
			userId: user.id,
			tenantId: event.tenantId,
			metadata: { eventId: event.id, ...result },
		})
		return redirectWithToast(`/admin/events/${event.id}`, {
			type: 'success',
			title: 'Setup saved',
			description: "The event's setup was updated.",
		})
	}

	const result = await applySetup(parsed.data, event, user.id)

	await auditRequest({
		request,
		action: AuditAction.UPDATE,
		entityType: AuditEntityType.EVENT,
		entityId: event.id,
		description:
			`Ran event setup for "${event.name}": ${result.types} participant type(s), ${result.restrictions} restriction(s), ${result.constraints} quota(s), ${result.invitations} invitation(s), ` +
			`${result.workflows} workflow(s), ${result.badges} badge template(s), ${result.emails} custom email(s), ` +
			`${result.access} access row(s)`,
		userId: user.id,
		tenantId: event.tenantId,
		metadata: { eventId: event.id, ...result },
	})

	return redirectWithToast(`/admin/events/${event.id}`, {
		type: 'success',
		title: 'Event set up',
		description: `Created ${result.workflows} workflows, ${result.badges} badge templates, ${result.invitations} invitations and ${result.access} staff assignments.`,
	})
}

export default function EventSetupRoute() {
	const { ctx, defaults, version } = useLoaderData<typeof loader>()
	const editing = ctx.mode === 'edit'
	const actionData = useActionData<typeof action>()
	const [plan, setPlan] = useState<SetupPlan>(defaults)
	const [i, setI] = useState(0)
	const [seen, setSeen] = useState(0)
	const isPending = useIsPending()
	const edit = editing ? summarizeEdit(ctx, defaults, plan) : null
	const summary = edit ?? summarizePlan(ctx, plan)
	const sectionChanged = (key: (typeof SETUP_SECTIONS)[number]['key']) =>
		edit ? edit.counts[key] > 0 : isSectionChanged(plan, defaults, key)
	const step = SETUP_SECTIONS[i]
	const go = (n: number) => {
		setI(n)
		setSeen(s => Math.max(s, n))
		window.scrollTo({ top: 0 })
	}
	const active = SETUP_SECTIONS.filter(s => !sectionSkipReason(ctx, s.key))
	const changed = active.filter(s => sectionChanged(s.key))
	const skipReason = step ? sectionSkipReason(ctx, step.key) : null
	const problems = planProblems(ctx, plan)

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-4">
				<div className="min-w-0">
					<p className="text-sm text-muted-foreground">
						{editing ? 'Edit setup (draft)' : 'Set up event'}
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
								: editing
									? 'Check the changes on the right, then save them in one go.'
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
									{editing
										? changed.length === 0
											? 'Nothing has changed yet.'
											: `You changed ${changed.length} of ${active.length} sections: ${changed
													.map(c => c.title.toLowerCase())
													.join(', ')}.`
										: changed.length === 0
											? 'You kept every default.'
											: `You changed ${changed.length} of ${active.length} sections from the defaults: ${changed
													.map(c => c.title.toLowerCase())
													.join(', ')}.`}
								</p>
								{problems.length > 0 && (
									<ul
										role="alert"
										className="flex flex-col gap-1 text-sm font-medium text-destructive"
									>
										{problems.map(p => (
											<li key={p}>{p}</li>
										))}
									</ul>
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
								<input type="hidden" name="mode" value={ctx.mode} />
								<input type="hidden" name="version" value={version} />
								<Button
									type="submit"
									disabled={
										isPending ||
										active.length === 0 ||
										problems.length > 0 ||
										(editing && changed.length === 0)
									}
									className="active:scale-[0.97]"
								>
									{editing
										? isPending
											? 'Saving…'
											: 'Save changes'
										: isPending
											? 'Setting up…'
											: 'Set up event'}
								</Button>
							</Form>
						)}
					</footer>
				</section>

				<aside
					className="lg:sticky lg:top-4 lg:self-start"
					aria-label={editing ? 'Changes to save' : 'What will be created'}
				>
					<div className="rounded-lg border bg-card">
						<h3 className="border-b px-4 py-3 text-sm font-semibold">
							{editing ? 'Changes to save' : 'Will be created'}
						</h3>
						<ol className="divide-y">
							{SETUP_SECTIONS.map((sec, n) => {
								const skipped = sectionSkipReason(ctx, sec.key)
								const isChanged = !skipped && sectionChanged(sec.key)
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
													{editing
														? 'No changes'
														: n <= seen
															? 'Default'
															: 'Not reviewed'}
												</span>
											)}
										</div>
										{!skipped && summary[sec.key] && (
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
												{editing ? 'Undo changes' : 'Reset to default'}
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
