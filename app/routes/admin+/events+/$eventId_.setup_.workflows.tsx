// Setup wizard → Workflows → "Change live workflows": add, remove or restore a
// step across every workflow of an event (or chosen ones) while participants
// are in them. Choices live in the URL, so the loader previews the exact plan;
// the action rebuilds it from the database and applies it in one transaction.
// Decision record: docs/decisions/2026-11-16-changing-workflows-mid-event.md
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useLoaderData,
	useSearchParams,
	useSubmit,
} from '@remix-run/react'
import { ArrowLeft } from 'lucide-react'
import { type ReactNode } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { Button } from '~/components/ui/button'
import { SearchableSelect } from '~/components/ui/searchable-select'
import { getClientIp, getUserAgent } from '~/utils/audit.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { requireSetupEvent } from '~/utils/event-setup.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { cn, useIsPending } from '~/utils/misc'
import { StepLifecycleError } from '~/utils/step-lifecycle-core.server'
import { redirectWithToast } from '~/utils/toast.server'
import {
	WORKFLOW_CHANGE_TRANSACTION,
	applyWorkflowChange,
} from '~/utils/workflow-changes-core.server'
import { resolveWorkflowChange } from '~/utils/workflow-changes.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { event } = await requireSetupEvent(request, params.eventId)
	const resolved = await resolveWorkflowChange(
		event,
		new URL(request.url).searchParams,
	)
	const { plan: _plan, ...data } = resolved
	return json({ event: { id: event.id, name: event.name }, ...data })
}

/** Fields that describe the change; everything else in the form is plumbing. */
const CHANGE_FIELDS = [
	'op',
	'scope',
	'wf',
	'source',
	'name',
	'action',
	'roleId',
	'assign',
	'after',
	'grant',
	'back',
	'step',
	'target',
]

export async function action({ request, params }: ActionFunctionArgs) {
	const { user, event } = await requireSetupEvent(request, params.eventId)
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const choices = new URLSearchParams()
	for (const key of CHANGE_FIELDS)
		for (const v of formData.getAll(key)) choices.append(key, String(v))

	const { plan, preview } = await resolveWorkflowChange(event, choices)
	if (!plan || !preview?.canApply)
		return json({ error: 'There is nothing to change.' }, { status: 400 })
	if (formData.get('fingerprint') !== preview.fingerprint)
		return json(
			{
				error:
					'The workflows changed since this preview was made (someone approved, moved or edited something). Check the updated preview and apply again.',
			},
			{ status: 409 },
		)

	let result
	try {
		result = await prisma.$transaction(
			tx =>
				applyWorkflowChange(tx, {
					event,
					plan,
					actorId: user.id,
					ipAddress: getClientIp(request),
					userAgent: getUserAgent(request) ?? 'setup wizard',
				}),
			WORKFLOW_CHANGE_TRANSACTION,
		)
	} catch (error) {
		if (error instanceof StepLifecycleError)
			return json({ error: error.message }, { status: 400 })
		throw error
	}

	return redirectWithToast(`/admin/events/${event.id}/setup/workflows`, {
		type: 'success',
		title: 'Workflows changed',
		description: result.summary,
	})
}

const FIELD =
	'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

function Field({
	label,
	hint,
	children,
}: {
	label: string
	hint?: ReactNode
	children: ReactNode
}) {
	return (
		<label className="flex flex-col gap-1.5">
			<span className="text-sm font-medium">{label}</span>
			{children}
			{hint && <span className="text-xs text-muted-foreground">{hint}</span>}
		</label>
	)
}

function Group({
	legend,
	hint,
	children,
}: {
	legend: string
	hint?: ReactNode
	children: ReactNode
}) {
	return (
		<fieldset className="flex flex-col gap-2">
			<legend className="mb-1.5 text-sm font-medium">{legend}</legend>
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
			{children}
		</fieldset>
	)
}

function Choice({
	type,
	name,
	value,
	checked,
	children,
}: {
	type: 'checkbox' | 'radio'
	name: string
	value: string
	checked: boolean
	children: ReactNode
}) {
	return (
		<label className="flex items-start gap-2 text-sm">
			<input
				type={type}
				name={name}
				value={value}
				defaultChecked={checked}
				className="mt-0.5 h-4 w-4 accent-primary"
			/>
			<span>{children}</span>
		</label>
	)
}

const OPS = [
	{
		value: 'add',
		label: 'Add a step',
		help: 'For example a second validation level.',
	},
	{
		value: 'remove',
		label: 'Remove a step',
		help: 'Retired if it has history, so approvals keep pointing at it.',
	},
	{
		value: 'restore',
		label: 'Restore a retired step',
		help: 'Put it back where it was, with its access.',
	},
] as const

export default function ChangeLiveWorkflowsRoute() {
	const data = useLoaderData<typeof loader>()
	const { event, overview, op, add, remove, restore, preview } = data
	const actionData = useActionData<typeof action>()
	const [searchParams] = useSearchParams()
	const submit = useSubmit()
	const isPending = useIsPending()
	// Remount the choices when the URL changes, so defaults follow the loader.
	const formKey = searchParams.toString()

	const resubmit = (form: HTMLFormElement | null) =>
		form && submit(form, { replace: true, preventScrollReset: true })

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-4">
				<div className="min-w-0">
					<p className="text-sm text-muted-foreground">
						Set up event · Workflows
					</p>
					<h1 className="truncate text-xl font-semibold">
						Change live workflows: {event.name}
					</h1>
				</div>
				<Button asChild variant="outline" size="sm">
					<Link to={`/admin/events/${event.id}/setup`}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to setup
					</Link>
				</Button>
			</div>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
				<section className="min-w-0 rounded-lg border bg-card">
					<header className="border-b px-6 py-4">
						<h2 className="text-lg font-semibold">What to change</h2>
						<p className="text-sm text-muted-foreground">
							Participants keep their place. Anyone moved gets a MOVE entry in
							their history, and every workflow touched gets an audit log entry.
						</p>
					</header>

					<Form
						key={formKey}
						method="GET"
						replace
						preventScrollReset
						className="flex flex-col gap-6 px-6 py-5"
						onChange={e => {
							const t = e.target as HTMLInputElement
							// Text fields preview on blur, not on every keystroke.
							if (t.type !== 'text') resubmit(e.currentTarget)
						}}
					>
						<Group legend="Change">
							{OPS.map(o => (
								<Choice
									key={o.value}
									type="radio"
									name="op"
									value={o.value}
									checked={op === o.value}
								>
									{o.label}
									<span className="block text-xs text-muted-foreground">
										{o.help}
									</span>
								</Choice>
							))}
						</Group>

						{op && (
							<Group legend="Participant types">
								<Choice
									type="radio"
									name="scope"
									value="all"
									checked={data.scope === 'all'}
								>
									All participant types ({overview.workflows.length})
								</Choice>
								<Choice
									type="radio"
									name="scope"
									value="some"
									checked={data.scope === 'some'}
								>
									Select participant types
								</Choice>
								{data.scope === 'some' && (
									<div className="ml-6 mt-1 flex flex-col gap-2">
										<div className="grid gap-1.5 sm:grid-cols-2">
											{overview.workflows.map(w => (
												<Choice
													key={w.id}
													type="checkbox"
													name="wf"
													value={w.id}
													checked={data.picked.includes(w.id)}
												>
													{w.typeName}
												</Choice>
											))}
										</div>
										{data.chosenCount === 0 && (
											<p className="text-xs text-muted-foreground">
												Tick at least one participant type.
											</p>
										)}
									</div>
								)}
							</Group>
						)}

						{add && (
							<>
								<Field
									label="Step to add"
									hint="Copy one from a workflow template, or describe a new one."
								>
									<SearchableSelect
										name="source"
										value={add.source}
										placeholder="Choose a step…"
										searchPlaceholder="Search steps or templates…"
										aria-label="Step to add"
										onValueChange={(_, input) => resubmit(input.form)}
										options={[
											...add.templateSteps.map(t => ({
												value: t.id,
												label: t.name,
												hint:
													t.detail +
													(t.inEveryChosen
														? ' · already in every workflow'
														: ''),
												group: `From “${t.templateName}”`,
											})),
											{
												value: 'custom',
												label: 'A new step I describe…',
												group: 'Other',
											},
										]}
									/>
								</Field>

								{add.source === 'custom' && (
									<div className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
										<Field label="Name">
											<input
												type="text"
												name="name"
												defaultValue={add.custom.name}
												onBlur={e => resubmit(e.currentTarget.form)}
												className={FIELD}
											/>
										</Field>
										<Field label="What happens at it">
											<SearchableSelect
												name="action"
												value={add.custom.action}
												aria-label="What happens at it"
												onValueChange={(_, input) => resubmit(input.form)}
												options={add.actions.map(a => ({ value: a, label: a }))}
											/>
										</Field>
										<Field label="Role that works on it">
											<SearchableSelect
												name="roleId"
												value={add.custom.roleId}
												placeholder="Choose a role…"
												searchPlaceholder="Search roles…"
												aria-label="Role that works on it"
												onValueChange={(_, input) => resubmit(input.form)}
												options={add.roles.map(r => ({
													value: r.id,
													label: r.name,
												}))}
											/>
										</Field>
										<Field label="Who can act on it">
											<SearchableSelect
												name="assign"
												value={add.custom.requiresAssignment ? 'yes' : 'no'}
												aria-label="Who can act on it"
												onValueChange={(_, input) => resubmit(input.form)}
												options={[
													{ value: 'yes', label: 'Only users given access' },
													{ value: 'no', label: 'Anyone with the role' },
												]}
											/>
										</Field>
									</div>
								)}

								{add.step && (
									<Field label={`Put "${add.step.name}" right after`}>
										<SearchableSelect
											name="after"
											value={add.afterName ?? ''}
											placeholder="Choose a step…"
											searchPlaceholder="Search steps…"
											aria-label={`Put "${add.step.name}" right after`}
											onValueChange={(_, input) => resubmit(input.form)}
											options={add.afterOptions.map(o => ({
												value: o.name,
												label: o.name,
												hint:
													o.count === data.chosenCount
														? undefined
														: `Only in ${o.count} of ${data.chosenCount} workflows`,
											}))}
										/>
									</Field>
								)}

								{add.step && add.afterName && add.staff.length > 0 && (
									<Group
										legend={`Give access to "${add.step.name}"`}
										hint={`Users with the ${add.step.roleName} role. Without access nobody sees the participants waiting there. Marked: works on "${add.afterName}" now.`}
									>
										<div className="grid gap-1.5 sm:grid-cols-2">
											{add.staff.map(u => (
												<Choice
													key={u.id}
													type="checkbox"
													name="grant"
													value={u.id}
													checked={searchParams.getAll('grant').includes(u.id)}
												>
													{u.name || u.username}
													<span className="text-muted-foreground">
														{' '}
														({u.username}){u.worksOnAfter ? ' •' : ''}
													</span>
												</Choice>
											))}
										</div>
									</Group>
								)}

								{add.back.length > 0 && (
									<Group
										legend="Move participants back"
										hint={`${add.back.reduce((n, b) => n + b.count, 0)} participants already passed "${add.afterName}" and are at "${add.nextNames.join(' / ')}". They won't go through the new step unless moved back. Tick the statuses to move; leave all unticked to leave them.`}
									>
										{add.back.map(b => (
											<Choice
												key={b.status}
												type="checkbox"
												name="back"
												value={b.status}
												checked={searchParams.getAll('back').includes(b.status)}
											>
												{b.status} ({b.count})
												{b.status === 'BYPASSED' && (
													<span className="text-muted-foreground">
														{' '}
														· bypassed, usually leave out
													</span>
												)}
											</Choice>
										))}
									</Group>
								)}
							</>
						)}

						{remove && (
							<>
								<Field label="Step to remove">
									<SearchableSelect
										name="step"
										value={remove.stepName ?? ''}
										placeholder="Choose a step…"
										searchPlaceholder="Search steps…"
										aria-label="Step to remove"
										onValueChange={(_, input) => resubmit(input.form)}
										options={remove.options.map(o => ({
											value: o.name,
											label: o.name,
											hint:
												o.count === data.chosenCount
													? undefined
													: `In ${o.count} of ${data.chosenCount} workflows`,
										}))}
									/>
								</Field>
								{remove.candidates && remove.candidates.waiting > 0 && (
									<Field
										label={`Move the ${remove.candidates.waiting} participants waiting there to`}
										hint="They have to be moved before the step can go."
									>
										<SearchableSelect
											name="target"
											value={remove.target}
											searchPlaceholder="Search steps…"
											aria-label="Move waiting participants to"
											onValueChange={(_, input) => resubmit(input.form)}
											options={[
												{
													value: 'next',
													label: `The step after “${remove.stepName}” in each workflow`,
												},
												...remove.candidates.otherSteps.map(o => ({
													value: `step:${o.name}`,
													label: o.name,
													hint:
														o.count === remove.candidates!.removable
															? undefined
															: `Only in ${o.count} of ${remove.candidates!.removable} workflows`,
												})),
												{
													value: 'skip',
													label:
														'Leave them; skip workflows with participants there',
												},
											]}
										/>
									</Field>
								)}
							</>
						)}

						{restore &&
							(restore.options.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									None of these workflows has a retired step.
								</p>
							) : (
								<Field label="Retired step to bring back">
									<SearchableSelect
										name="step"
										value={restore.stepName ?? ''}
										placeholder="Choose a step…"
										searchPlaceholder="Search retired steps…"
										aria-label="Retired step to bring back"
										onValueChange={(_, input) => resubmit(input.form)}
										options={restore.options.map(o => ({
											value: o.name,
											label: o.name,
											hint: `Retired in ${o.count} of ${data.chosenCount} workflows`,
										}))}
									/>
								</Field>
							))}

						<noscript>
							<Button type="submit" variant="outline">
								Preview
							</Button>
						</noscript>
					</Form>
				</section>

				<aside
					className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start"
					aria-label="Preview"
				>
					<div className="rounded-lg border bg-card">
						<h3 className="border-b px-4 py-3 text-sm font-semibold">
							{preview ? 'Will change' : 'Current workflows'}
						</h3>
						{preview ? (
							<div className="flex flex-col gap-3 px-4 py-3 text-sm">
								<p className="font-medium">{preview.title}</p>
								{preview.rows.length > 0 && (
									<ul className="flex flex-col gap-1.5">
										{preview.rows.map(r => (
											<li key={r.typeName}>
												<span className="font-medium">{r.typeName}</span>
												<span className="block text-xs text-muted-foreground">
													{r.text}
												</span>
											</li>
										))}
									</ul>
								)}
								{preview.notes.map(n => (
									<p key={n} className="text-xs">
										{n}
									</p>
								))}
								{preview.skipped.length > 0 && (
									<div>
										<p className="text-xs font-medium">Skipped</p>
										<ul className="text-xs text-muted-foreground">
											{preview.skipped.map(s => (
												<li key={s.typeName}>
													{s.typeName}: {s.reason}
												</li>
											))}
										</ul>
									</div>
								)}
								{actionData?.error && (
									<p
										role="alert"
										className="text-sm font-medium text-destructive"
									>
										{actionData.error}
									</p>
								)}
								<Form method="POST" className="border-t pt-3">
									<AuthenticityTokenInput />
									<HoneypotInputs />
									{[...searchParams].map(([k, v], n) => (
										<input key={`${k}${n}`} type="hidden" name={k} value={v} />
									))}
									<input
										type="hidden"
										name="fingerprint"
										value={preview.fingerprint}
									/>
									<Button
										type="submit"
										className="w-full active:scale-[0.97]"
										disabled={!preview.canApply || isPending}
									>
										{isPending
											? 'Applying…'
											: preview.canApply
												? 'Apply change'
												: 'Nothing to change'}
									</Button>
								</Form>
							</div>
						) : (
							<ul className="flex flex-col gap-3 px-4 py-3">
								{overview.shapes.map(s => (
									<li key={s.typeNames.join()} className="text-sm">
										<p>{s.steps.join(' → ')}</p>
										{s.offChain.length > 0 && (
											<p className="text-xs text-muted-foreground">
												Also: {s.offChain.join(', ')}
											</p>
										)}
										<p className="text-xs text-muted-foreground">
											{s.every ? 'Every workflow' : s.typeNames.join(', ')}
										</p>
									</li>
								))}
								{overview.retired.length > 0 && (
									<li className="text-xs text-muted-foreground">
										Retired:{' '}
										{overview.retired
											.map(r => `${r.name} (${r.count})`)
											.join(', ')}
									</li>
								)}
								{overview.workflows.length === 0 && (
									<li className="text-sm text-muted-foreground">
										This event has no workflows yet. Create them in the setup
										wizard first.
									</li>
								)}
							</ul>
						)}
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
						message="This event is closed. Reopen it before changing its workflows."
						redirectUrl="/admin/events"
						errorCode={409}
					/>
				),
			}}
		/>
	)
}
