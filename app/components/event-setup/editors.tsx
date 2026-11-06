import { ChevronDown, ClipboardPaste, Plus, X } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import {
	KEEP,
	eventTypeIds,
	forEventTypes,
	invitationProblems,
	parseInvitationLines,
	restrictionChoices,
	stepsForUser,
	workflowsWithStep,
	type SetupContext,
	type SetupInvitation,
	type SetupPlan,
	type SetupRestriction,
	type SetupSectionKey,
} from '~/utils/event-setup'
import { cn } from '~/utils/misc'
import {
	EMAIL_TEMPLATE_DEFAULTS,
	EMAIL_TRIGGERS,
	type EmailTrigger,
} from '~/utils/participant-email'

type EditorProps = {
	ctx: SetupContext
	plan: SetupPlan
	setPlan: (fn: (p: SetupPlan) => SetupPlan) => void
}

/** Radix Select forbids an empty item value, so "none" travels as this sentinel. */
const NONE = '__none'

export function Pick({
	value,
	onChange,
	options,
	label,
	placeholder,
	className,
	disabled,
}: {
	/** undefined shows the placeholder; '' is the "none" option. */
	value: string | undefined
	onChange: (v: string) => void
	options: { value: string; label: string }[]
	label: string
	placeholder?: string
	className?: string
	disabled?: boolean
}) {
	return (
		<Select
			value={value === undefined ? '' : value === '' ? NONE : value}
			onValueChange={v => onChange(v === NONE ? '' : v)}
			disabled={disabled}
		>
			<SelectTrigger aria-label={label} className={cn('h-9', className)}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{options.map(o => (
					<SelectItem key={o.value || NONE} value={o.value || NONE}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

export function SectionEditor({
	section,
	...props
}: EditorProps & { section: SetupSectionKey }) {
	if (section === 'types') return <TypesEditor {...props} />
	if (section === 'restrictions') return <RestrictionsEditor {...props} />
	if (section === 'invitations') return <InvitationsEditor {...props} />
	if (section === 'workflows')
		return <PerTypeEditor field="workflows" {...props} />
	if (section === 'badges') return <PerTypeEditor field="badges" {...props} />
	if (section === 'emails') return <EmailsEditor {...props} />
	return <AccessEditor {...props} />
}

let keySeq = 0
const nextKey = () => `n${keySeq++}`

function TypesEditor({ ctx, plan, setPlan }: EditorProps) {
	const types = ctx.participantTypes.filter(t =>
		ctx.assignableTypeIds.includes(t.id),
	)
	const selected = new Set(plan.types)
	const locked = (id: string) =>
		ctx.mode === 'edit' && ctx.existing.typeIds.includes(id)
			? ctx.locks.typeRemoval[id]
			: undefined
	const setTypes = (ids: string[]) => setPlan(p => ({ ...p, types: ids }))
	const toggle = (id: string, on: boolean) =>
		setPlan(p => ({
			...p,
			types: on
				? ctx.assignableTypeIds.filter(t => t === id || p.types.includes(t))
				: p.types.filter(t => t !== id),
		}))

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
				<p className="text-sm text-muted-foreground">
					{ctx.mode === 'edit'
						? 'The event\u2019s saved list.'
						: ctx.previousEvent
							? `Prefilled from ${ctx.previousEvent.name}.`
							: 'All of the tenant\u2019s types are selected to start.'}{' '}
					<span className="tabular-nums">
						{selected.size} of {types.length}
					</span>{' '}
					selected.
				</p>
				<div className="ml-auto flex gap-1">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => setTypes([...ctx.assignableTypeIds])}
					>
						Select all
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						// Types that can't be removed stay ticked.
						onClick={() =>
							setTypes(ctx.assignableTypeIds.filter(id => locked(id)))
						}
					>
						Clear
					</Button>
				</div>
			</div>
			<ul className="grid gap-x-4 rounded-lg border p-2 sm:grid-cols-2 lg:grid-cols-3">
				{types.map(t => {
					const reason = selected.has(t.id) ? locked(t.id) : undefined
					return (
						<li key={t.id}>
							<label
								className={cn(
									'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
									reason
										? 'cursor-not-allowed'
										: 'cursor-pointer hover:bg-muted/50',
								)}
								title={
									reason ? `${reason}, so it can\u2019t be removed.` : undefined
								}
							>
								<Checkbox
									checked={selected.has(t.id)}
									disabled={Boolean(reason)}
									onCheckedChange={v => toggle(t.id, v === true)}
								/>
								<span className="truncate">{t.name}</span>
							</label>
						</li>
					)
				})}
			</ul>
			<p className="text-xs text-muted-foreground">
				Quotas can also use &ldquo;Any&rdquo;, which covers every type selected
				here.
				{ctx.mode === 'edit' &&
					' Unticking a type also removes its workflow and badge template. Types with participants or invitations can\u2019t be unticked.'}
			</p>
		</div>
	)
}

function RestrictionsEditor({ ctx, plan, setPlan }: EditorProps) {
	const inEvent = eventTypeIds(ctx, plan)
	const typeOptions = ctx.participantTypes
		.filter(t => inEvent.has(t.id) || !ctx.assignableTypeIds.includes(t.id))
		.map(t => ({ value: t.id, label: t.name }))
	const update = (
		rKey: string,
		fn: (r: SetupRestriction) => SetupRestriction,
	) =>
		setPlan(p => ({
			...p,
			restrictions: p.restrictions.map(r => (r.key === rKey ? fn(r) : r)),
		}))
	const updateConstraint = (
		rKey: string,
		cKey: string,
		patch: Partial<SetupRestriction['constraints'][number]>,
	) =>
		update(rKey, r => ({
			...r,
			constraints: r.constraints.map(c =>
				c.key === cKey ? { ...c, ...patch } : c,
			),
		}))

	return (
		<div className="flex flex-col gap-4">
			{ctx.mode === 'edit' && (
				<p className="text-sm text-muted-foreground">
					Saved invitations keep the quotas they were given, so changes here
					only apply to invitations added from now on. A restriction can&rsquo;t
					be removed while an invitation uses it.
				</p>
			)}
			{plan.restrictions.length === 0 && (
				<p className="text-sm text-muted-foreground">
					No restrictions yet. Add one for each delegation group and its quotas.
					Invitations without a restriction have no quotas.
				</p>
			)}
			{plan.restrictions.map(r => {
				const users = plan.invitations.filter(
					i => i.restrictionKey === r.key,
				).length
				const lock =
					users > 0
						? `Used by ${users} invitation${users === 1 ? '' : 's'}`
						: ''
				return (
					<div key={r.key} className="rounded-lg border">
						<div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
							<Input
								aria-label="Restriction name"
								value={r.name}
								onChange={e =>
									update(r.key, x => ({ ...x, name: e.target.value }))
								}
								className="h-9 max-w-xs bg-background font-medium"
							/>
							{lock && (
								<span className="ml-auto text-xs text-muted-foreground">
									{lock}
								</span>
							)}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className={cn('text-muted-foreground', !lock && 'ml-auto')}
								disabled={Boolean(lock)}
								onClick={() =>
									setPlan(p => ({
										...p,
										restrictions: p.restrictions.filter(x => x.key !== r.key),
									}))
								}
							>
								Remove restriction
							</Button>
						</div>
						<div className="flex flex-col gap-2 p-3">
							{r.constraints.length > 0 && (
								<div className="hidden grid-cols-[1fr_1fr_8rem_6rem_2.5rem] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
									<span>Quota name</span>
									<span>Participant type</span>
									<span>Session</span>
									<span className="text-right">Quota</span>
									<span />
								</div>
							)}
							{r.constraints.map(c => (
								<div
									key={c.key}
									className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_8rem_6rem_2.5rem]"
								>
									<Input
										aria-label="Quota name"
										value={c.name}
										className="h-9"
										onChange={e =>
											updateConstraint(r.key, c.key, { name: e.target.value })
										}
									/>
									<Pick
										label="Participant type"
										value={
											typeOptions.some(o => o.value === c.participantTypeId)
												? c.participantTypeId
												: undefined
										}
										placeholder="Not in this event"
										options={typeOptions}
										onChange={v =>
											updateConstraint(r.key, c.key, { participantTypeId: v })
										}
									/>
									<Pick
										label="Session"
										value={c.accessLevel}
										options={[
											{ value: 'OPEN', label: 'Open' },
											{ value: 'CLOSED', label: 'Closed' },
										]}
										onChange={v =>
											updateConstraint(r.key, c.key, {
												accessLevel: v as 'OPEN' | 'CLOSED',
											})
										}
									/>
									<Input
										aria-label="Quota"
										type="number"
										min={0}
										inputMode="numeric"
										value={c.quota}
										className="h-9 text-right tabular-nums"
										onChange={e =>
											updateConstraint(r.key, c.key, {
												quota: Math.max(
													0,
													Math.floor(Number(e.target.value) || 0),
												),
											})
										}
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-9 w-10"
										aria-label={`Remove quota ${c.name}`}
										onClick={() =>
											update(r.key, x => ({
												...x,
												constraints: x.constraints.filter(y => y.key !== c.key),
											}))
										}
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
							))}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="self-start"
								onClick={() =>
									update(r.key, x => ({
										...x,
										constraints: [
											...x.constraints,
											{
												key: nextKey(),
												name: 'New quota',
												participantTypeId: typeOptions[0]?.value ?? '',
												accessLevel: 'OPEN',
												quota: 0,
											},
										],
									}))
								}
							>
								<Plus className="mr-1.5 h-4 w-4" />
								Add quota
							</Button>
							<p className="px-1 text-xs text-muted-foreground">
								Quota 0 means no limit.
							</p>
						</div>
					</div>
				)
			})}
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="self-start"
				onClick={() =>
					setPlan(p => ({
						...p,
						restrictions: [
							...p.restrictions,
							{ key: nextKey(), name: 'New restriction', constraints: [] },
						],
					}))
				}
			>
				<Plus className="mr-1.5 h-4 w-4" />
				Add restriction
			</Button>
		</div>
	)
}

/** Organization, focal point, email, restriction, maximum, remove. */
const INVITATION_COLS =
	'grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_9rem_4.5rem_2.5rem]'

/** One editable row per invitation, plus pasting rows from a spreadsheet. */
function InvitationsEditor({ ctx, plan, setPlan }: EditorProps) {
	const choices = restrictionChoices(ctx, plan)
	const options = [
		...choices.map(r => ({ value: r.key, label: r.name || 'Unnamed' })),
		{ value: '', label: 'No restriction' },
	]
	const firstChoice = choices[0]?.key ?? ''
	const [pasting, setPasting] = useState(false)
	const [text, setText] = useState('')
	const [pasteRestriction, setPasteRestriction] = useState(firstChoice)
	const problems = invitationProblems(ctx, plan)
	const problemCount = Object.keys(problems).length
	const parsed = parseInvitationLines(text, pasteRestriction, nextKey)
	const set = (fn: (list: SetupInvitation[]) => SetupInvitation[]) =>
		setPlan(p => ({ ...p, invitations: fn(p.invitations) }))
	const update = (key: string, patch: Partial<SetupInvitation>) =>
		set(list => list.map(i => (i.key === key ? { ...i, ...patch } : i)))

	return (
		<div className="flex flex-col gap-4">
			<p className="max-w-prose text-sm text-muted-foreground">
				Each invitation is one organization&rsquo;s focal point, and gets the
				quotas of the restriction you pick. This step is optional: you can also
				add invitations on the Invitations tab later.
				{ctx.mode === 'edit' &&
					' Changing a saved invitation\u2019s restriction replaces the quotas it got from the old one.'}
			</p>

			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() =>
						set(list => [
							...list,
							{
								key: nextKey(),
								organization: '',
								name: '',
								email: '',
								restrictionKey: firstChoice,
								maximumQuota: '',
							},
						])
					}
				>
					<Plus className="mr-1.5 h-4 w-4" />
					Add invitation
				</Button>
				<Button
					type="button"
					variant={pasting ? 'secondary' : 'outline'}
					size="sm"
					aria-expanded={pasting}
					onClick={() => setPasting(p => !p)}
				>
					<ClipboardPaste className="mr-1.5 h-4 w-4" />
					Paste from spreadsheet
				</Button>
				{plan.invitations.length > 0 && (
					<span className="ml-auto text-sm tabular-nums text-muted-foreground">
						{plan.invitations.length} invitation
						{plan.invitations.length === 1 ? '' : 's'}
						{problemCount > 0 && (
							<span className="text-destructive"> · {problemCount} to fix</span>
						)}
					</span>
				)}
			</div>

			{pasting && (
				<div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="paste-invitations">
							One invitation per line: organization, focal point, email
						</Label>
						<Textarea
							id="paste-invitations"
							rows={5}
							wrap="off"
							spellCheck={false}
							value={text}
							onChange={e => setText(e.target.value)}
							placeholder={
								'Parliament of Ghana, Kwame Asante, kasante@parliament.gh\nNational Assembly of Zambia, , clerk@parliament.gov.zm'
							}
							className="bg-background font-mono text-sm"
						/>
						<p className="text-xs text-muted-foreground">
							Columns copied from a spreadsheet work too. The focal point can be
							left empty.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-sm">Restriction for these:</span>
						<Pick
							label="Restriction for pasted invitations"
							value={pasteRestriction}
							options={options}
							onChange={setPasteRestriction}
							className="w-48 bg-background"
						/>
						<Button
							type="button"
							size="sm"
							className="ml-auto active:scale-[0.97]"
							disabled={parsed.length === 0}
							onClick={() => {
								set(list => [...list, ...parsed])
								setText('')
								setPasting(false)
							}}
						>
							{parsed.length === 0
								? 'Add rows'
								: `Add ${parsed.length} ${parsed.length === 1 ? 'row' : 'rows'}`}
						</Button>
					</div>
				</div>
			)}

			{plan.invitations.length === 0 ? (
				<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
					No invitations yet. Setup works without them.
				</p>
			) : (
				<div className="flex flex-col gap-2">
					<div
						className={cn(
							INVITATION_COLS,
							'hidden px-1 text-xs font-medium text-muted-foreground sm:grid',
						)}
					>
						<span>Organization</span>
						<span>Focal point</span>
						<span>Email</span>
						<span>Restriction</span>
						<span className="text-right">Maximum</span>
						<span />
					</div>
					{plan.invitations.map((i, n) => {
						const lock = ctx.locks.invitation[i.key]
						const label = i.organization || `row ${n + 1}`
						return (
							<div key={i.key} className="flex flex-col gap-1">
								<div className={INVITATION_COLS}>
									<Input
										aria-label={`Organization, row ${n + 1}`}
										value={i.organization}
										title={i.organization}
										onChange={e =>
											update(i.key, { organization: e.target.value })
										}
										className="h-9"
									/>
									<Input
										aria-label={`Focal point, row ${n + 1}`}
										value={i.name}
										placeholder="Optional"
										onChange={e => update(i.key, { name: e.target.value })}
										className="h-9"
									/>
									<Input
										aria-label={`Email, row ${n + 1}`}
										type="email"
										value={i.email}
										title={i.email}
										spellCheck={false}
										autoComplete="off"
										aria-invalid={Boolean(problems[i.key])}
										onChange={e => update(i.key, { email: e.target.value })}
										className={cn(
											'h-9',
											problems[i.key] && 'border-destructive',
										)}
									/>
									<Pick
										label={`Restriction, row ${n + 1}`}
										value={
											options.some(o => o.value === i.restrictionKey)
												? i.restrictionKey
												: undefined
										}
										placeholder="Removed"
										options={options}
										onChange={v => update(i.key, { restrictionKey: v })}
									/>
									<Input
										aria-label={`Maximum participants, row ${n + 1}`}
										inputMode="numeric"
										value={i.maximumQuota}
										placeholder="None"
										onChange={e =>
											update(i.key, { maximumQuota: e.target.value })
										}
										className="h-9 text-right tabular-nums"
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-9 w-10"
										disabled={Boolean(lock)}
										title={lock ? `${lock}, so it can't be removed` : undefined}
										aria-label={`Remove ${label}`}
										onClick={() =>
											set(list => list.filter(x => x.key !== i.key))
										}
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
								{(problems[i.key] || lock) && (
									<p
										className={cn(
											'px-1 text-xs',
											problems[i.key]
												? 'text-destructive'
												: 'text-muted-foreground',
										)}
									>
										Row {n + 1}:{' '}
										{problems[i.key] ?? `${lock}, so it can\u2019t be removed`}
									</p>
								)}
							</div>
						)
					})}
					<p className="px-1 text-xs text-muted-foreground">
						Maximum caps how many people the organization can register in total.
						Empty means only the restriction&rsquo;s quotas apply.
					</p>
				</div>
			)}
		</div>
	)
}

/** Name column and dropdown column, shared by "set all" and the per-type rows so they line up. */
const ROW =
	'grid grid-cols-1 items-center gap-x-4 gap-y-1 px-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]'

/** One choice per participant type that doesn't have one yet, with "set all". */
function PerTypeEditor({
	ctx,
	plan,
	setPlan,
	field,
}: EditorProps & { field: 'workflows' | 'badges' }) {
	const options = [
		...(field === 'workflows' ? ctx.workflowTemplates : ctx.badgeTemplates).map(
			t => ({
				value: t.id,
				label: t.name,
			}),
		),
		{ value: '', label: field === 'workflows' ? 'No workflow' : 'No badge' },
	]
	const editing = ctx.mode === 'edit'
	const has = (id: string) =>
		field === 'workflows'
			? ctx.existing.workflows.some(w => w.participantTypeId === id)
			: ctx.existing.badgeTypeIds.includes(id)
	/** Why a type's workflow is fixed: it has participants. */
	const lockedReason = (id: string) =>
		editing && field === 'workflows' && has(id)
			? ctx.locks.workflow[id]
			: undefined
	const optionsFor = (id: string) => {
		if (!editing || !has(id)) return options
		// A badge row is kept and repointed, so "keep" only matters when its design is gone.
		const keep =
			field === 'workflows'
				? [
						{
							value: KEEP,
							label: `Keep current (${ctx.saved.workflowNames[id] ?? 'workflow'})`,
						},
					]
				: plan.badges[id] === KEEP
					? [{ value: KEEP, label: 'Keep current' }]
					: []
		// A badge with uploaded files can be switched but not removed.
		const rest =
			field === 'badges' && ctx.locks.badge[id]
				? options.filter(o => o.value)
				: options
		return [...keep, ...rest]
	}
	const typeIds = Object.keys(forEventTypes(ctx, plan, plan[field]))
	const types = ctx.participantTypes.filter(t => typeIds.includes(t.id))
	const skipped = eventTypeIds(ctx, plan).size - types.length
	const values = typeIds.map(id => plan[field][id])
	const uniform = values.every(v => v === values[0]) ? values[0] : undefined
	const settable = typeIds.filter(id => !lockedReason(id))

	return (
		<div className="flex flex-col gap-3">
			<div className={cn(ROW, 'rounded-lg border bg-muted/40 py-2')}>
				<span className="text-sm font-medium">
					Set all {settable.length} {settable.length === 1 ? 'type' : 'types'}{' '}
					to
				</span>
				<Pick
					label="Set every participant type"
					value={uniform}
					placeholder="Mixed"
					options={options}
					onChange={v =>
						setPlan(p => ({
							...p,
							[field]: {
								...p[field],
								...Object.fromEntries(settable.map(k => [k, v])),
							},
						}))
					}
					className="w-full bg-background"
				/>
			</div>
			{editing && (
				<p className="text-sm text-muted-foreground">
					{field === 'workflows'
						? 'Picking a template replaces the type\u2019s workflow, including any changes made to it on the Workflows tab, and the staff access on its steps is set again from the Staff access step. Types with participants keep theirs.'
						: 'Picking a different design keeps the type\u2019s badge template and points it at that design.'}
				</p>
			)}
			{skipped > 0 && (
				<p className="text-sm text-muted-foreground">
					{skipped} {skipped === 1 ? 'type already has' : 'types already have'}{' '}
					one and {skipped === 1 ? 'is' : 'are'} left as{' '}
					{skipped === 1 ? 'it is' : 'they are'}.
				</p>
			)}
			<ul className="flex flex-col">
				{types.map(t => (
					<li key={t.id} className={cn(ROW, 'border-b py-1.5 last:border-b-0')}>
						<span
							className={cn(
								'truncate text-sm',
								!plan[field][t.id] && 'text-muted-foreground',
							)}
						>
							{t.name}
						</span>
						<div className="flex flex-col gap-1">
							<Pick
								label={`${field === 'workflows' ? 'Workflow' : 'Badge'} for ${t.name}`}
								value={plan[field][t.id] ?? ''}
								options={optionsFor(t.id)}
								disabled={Boolean(lockedReason(t.id))}
								onChange={v =>
									setPlan(p => ({ ...p, [field]: { ...p[field], [t.id]: v } }))
								}
								className="w-full"
							/>
							{lockedReason(t.id) && (
								<span className="text-xs text-muted-foreground">
									{lockedReason(t.id)}, so its workflow can&rsquo;t be replaced.
								</span>
							)}
						</div>
					</li>
				))}
			</ul>
		</div>
	)
}

function EmailsEditor({ ctx, plan, setPlan }: EditorProps) {
	const triggers = EMAIL_TRIGGERS.filter(t => plan.emails[t] !== undefined)
	const skipped = ctx.existing.emailTriggers.length
	return (
		<div className="flex flex-col gap-3">
			{ctx.mode === 'edit' ? (
				<p className="text-sm text-muted-foreground">
					Each email shows what is saved for this event. Putting one back to the
					default text removes its customisation.
				</p>
			) : (
				skipped > 0 && (
					<p className="text-sm text-muted-foreground">
						{skipped} {skipped === 1 ? 'email was' : 'emails were'} already
						customised for this event and {skipped === 1 ? 'is' : 'are'} left as{' '}
						{skipped === 1 ? 'it is' : 'they are'}.
					</p>
				)
			)}
			<ul className="flex flex-col divide-y rounded-lg border">
				{triggers.map(trigger => (
					<EmailRow
						key={trigger}
						trigger={trigger}
						plan={plan}
						setPlan={setPlan}
					/>
				))}
			</ul>
		</div>
	)
}

function EmailRow({
	trigger,
	plan,
	setPlan,
}: {
	trigger: EmailTrigger
	plan: SetupPlan
	setPlan: EditorProps['setPlan']
}) {
	const [open, setOpen] = useState(false)
	const id = useId()
	const row = plan.emails[trigger]!
	const meta = EMAIL_TEMPLATE_DEFAULTS[trigger]
	const set = (patch: Partial<typeof row>) =>
		setPlan(p => ({
			...p,
			emails: { ...p.emails, [trigger]: { ...p.emails[trigger]!, ...patch } },
		}))

	return (
		<li className="flex flex-col gap-3 p-3">
			<div className="flex items-start gap-3">
				<Switch
					id={`${id}-on`}
					checked={row.enabled}
					onCheckedChange={v => set({ enabled: v })}
					className="mt-0.5"
				/>
				<label
					htmlFor={`${id}-on`}
					className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5"
				>
					<span className="text-sm font-medium">{meta.label}</span>
					<span className="text-sm text-muted-foreground">
						{meta.description}
					</span>
				</label>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					aria-expanded={open}
					aria-controls={`${id}-body`}
					onClick={() => setOpen(o => !o)}
				>
					{open ? 'Hide text' : 'Edit text'}
					<ChevronDown
						className={cn(
							'ml-1 h-4 w-4 transition-transform duration-150',
							open && 'rotate-180',
						)}
					/>
				</Button>
			</div>
			{open && (
				<div id={`${id}-body`} className="flex flex-col gap-2 sm:pl-12">
					<Label htmlFor={`${id}-subject`}>Subject</Label>
					<Input
						id={`${id}-subject`}
						value={row.subject}
						onChange={e => set({ subject: e.target.value })}
					/>
					<Label htmlFor={`${id}-text`}>Body</Label>
					<Textarea
						id={`${id}-text`}
						rows={8}
						value={row.body}
						onChange={e => set({ body: e.target.value })}
					/>
					<p className="text-xs text-muted-foreground">
						Placeholders such as {'{fullName}'} and {'{registrationCode}'} are
						filled in when the email is sent. Preview and test-send it later on
						the Emails tab.
					</p>
				</div>
			)}
		</li>
	)
}

function AccessEditor({ ctx, plan, setPlan }: EditorProps) {
	return (
		<div className="flex flex-col gap-3">
			{ctx.mode === 'edit' ? (
				<p className="text-sm text-muted-foreground">
					Each person shows the step they work on most in this event. Changing
					it replaces their step access in this event; people you don&rsquo;t
					change keep theirs.
				</p>
			) : (
				ctx.existing.accessRows > 0 && (
					<p className="text-sm text-muted-foreground">
						The event already has {ctx.existing.accessRows} access{' '}
						{ctx.existing.accessRows === 1 ? 'row' : 'rows'}. These are kept,
						and anything below that duplicates them is skipped.
					</p>
				)
			)}
			<div className="overflow-x-auto rounded-lg border">
				<table className="w-full text-sm">
					<thead className="bg-muted/40 text-left text-xs text-muted-foreground">
						<tr>
							<th className="px-3 py-2 font-medium">Staff</th>
							<th className="px-3 py-2 font-medium">Role</th>
							<th className="px-3 py-2 font-medium">Works on step</th>
							<th className="px-3 py-2 text-right font-medium">Workflows</th>
						</tr>
					</thead>
					<tbody className="divide-y">
						{plan.access.map(a => {
							const user = ctx.staff.find(u => u.id === a.userId)
							if (!user) return null
							const steps = stepsForUser(ctx, plan, a.userId)
							const n = workflowsWithStep(ctx, plan, a.stepName)
							return (
								<tr key={a.userId}>
									<td className="px-3 py-2">
										<div className="font-medium">{user.name}</div>
										<div className="text-xs text-muted-foreground">
											{user.username}
										</div>
										{(ctx.saved.accessSteps[user.id] ?? 0) > 1 && (
											<div className="text-xs text-muted-foreground">
												Now on {ctx.saved.accessSteps[user.id]} different steps
											</div>
										)}
									</td>
									<td className="px-3 py-2 capitalize">
										{user.roles.join(', ')}
									</td>
									<td className="px-3 py-2">
										{steps.length ? (
											<Pick
												label={`Step for ${user.name}`}
												value={a.stepName}
												options={[
													...steps.map(s => ({ value: s, label: s })),
													{ value: '', label: 'No access' },
												]}
												onChange={v =>
													setPlan(p => ({
														...p,
														access: p.access.map(x =>
															x.userId === a.userId ? { ...x, stepName: v } : x,
														),
													}))
												}
												className="w-56"
											/>
										) : (
											<span className="text-muted-foreground">
												No matching step in these workflows
											</span>
										)}
									</td>
									<td className="px-3 py-2 text-right tabular-nums">
										{n || '–'}
									</td>
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
		</div>
	)
}
