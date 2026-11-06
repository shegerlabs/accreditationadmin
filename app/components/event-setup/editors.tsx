import { ChevronDown, Plus, X } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '~/components/ui/button'
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
	stepsForUser,
	workflowsWithStep,
	type SetupContext,
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

function Pick({
	value,
	onChange,
	options,
	label,
	placeholder,
	className,
}: {
	/** undefined shows the placeholder; '' is the "none" option. */
	value: string | undefined
	onChange: (v: string) => void
	options: { value: string; label: string }[]
	label: string
	placeholder?: string
	className?: string
}) {
	return (
		<Select
			value={value === undefined ? '' : value === '' ? NONE : value}
			onValueChange={v => onChange(v === NONE ? '' : v)}
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
	if (section === 'restrictions') return <RestrictionsEditor {...props} />
	if (section === 'workflows')
		return <PerTypeEditor field="workflows" {...props} />
	if (section === 'badges') return <PerTypeEditor field="badges" {...props} />
	if (section === 'emails') return <EmailsEditor {...props} />
	return <AccessEditor {...props} />
}

let keySeq = 0
const nextKey = () => `n${keySeq++}`

function RestrictionsEditor({ ctx, plan, setPlan }: EditorProps) {
	const typeOptions = ctx.participantTypes.map(t => ({
		value: t.id,
		label: t.name,
	}))
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
			{plan.restrictions.length === 0 && (
				<p className="text-sm text-muted-foreground">
					No restrictions. Invitations will have no quotas until you add some.
				</p>
			)}
			{plan.restrictions.map(r => (
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
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="ml-auto text-muted-foreground"
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
									value={c.participantTypeId}
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
											participantTypeId: ctx.participantTypes[0]?.id ?? '',
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
			))}
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
	const typeIds = Object.keys(plan[field])
	const types = ctx.participantTypes.filter(t => typeIds.includes(t.id))
	const skipped = ctx.assignableTypeIds.length - types.length
	const values = Object.values(plan[field])
	const uniform = values.every(v => v === values[0]) ? values[0] : undefined

	return (
		<div className="flex flex-col gap-3">
			<div className={cn(ROW, 'rounded-lg border bg-muted/40 py-2')}>
				<span className="text-sm font-medium">
					Set all {types.length} {types.length === 1 ? 'type' : 'types'} to
				</span>
				<Pick
					label="Set every participant type"
					value={uniform}
					placeholder="Mixed"
					options={options}
					onChange={v =>
						setPlan(p => ({
							...p,
							[field]: Object.fromEntries(
								Object.keys(p[field]).map(k => [k, v]),
							),
						}))
					}
					className="w-full bg-background"
				/>
			</div>
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
						<Pick
							label={`${field === 'workflows' ? 'Workflow' : 'Badge'} for ${t.name}`}
							value={plan[field][t.id] ?? ''}
							options={options}
							onChange={v =>
								setPlan(p => ({ ...p, [field]: { ...p[field], [t.id]: v } }))
							}
							className="w-full"
						/>
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
			{skipped > 0 && (
				<p className="text-sm text-muted-foreground">
					{skipped} {skipped === 1 ? 'email was' : 'emails were'} already
					customised for this event and {skipped === 1 ? 'is' : 'are'} left as{' '}
					{skipped === 1 ? 'it is' : 'they are'}.
				</p>
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
			{ctx.existing.accessRows > 0 && (
				<p className="text-sm text-muted-foreground">
					The event already has {ctx.existing.accessRows} access{' '}
					{ctx.existing.accessRows === 1 ? 'row' : 'rows'}. These are kept, and
					anything below that duplicates them is skipped.
				</p>
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
