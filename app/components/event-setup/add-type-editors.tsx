// Editors for the add-participant-type wizard, one per section.
// Decision record: docs/decisions/2026-11-06-event-participant-types.md

import { useId } from 'react'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import {
	type AddTypeContext,
	type AddTypePlan,
	type AddTypeSectionKey,
	type PickedType,
	defaultAccess,
	openLevels,
	stepsForStaff,
	typesForQuota,
	workflowSteps,
} from '~/utils/add-participant-type'
import { cn } from '~/utils/misc'
import { Pick } from './editors'

type Props = {
	ctx: AddTypeContext
	plan: AddTypePlan
	setPlan: (fn: (p: AddTypePlan) => AddTypePlan) => void
}

export function AddTypeSectionEditor({
	section,
	...props
}: Props & { section: AddTypeSectionKey }) {
	if (section === 'workflow') return <WorkflowEditor {...props} />
	if (section === 'badge') return <BadgeEditor {...props} />
	if (section === 'access') return <AccessEditor {...props} />
	return <QuotasEditor {...props} />
}

/** The first step: which types to add. Each change reloads the page for the new set. */
export function TypePicker({
	ctx,
	onPick,
	disabled,
}: {
	ctx: AddTypeContext
	onPick: (typeIds: string[]) => void
	disabled?: boolean
}) {
	const id = useId()
	if (ctx.candidates.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Every one of the tenant&rsquo;s participant types is already set up for
				this event. Create a new type under the tenant first, then come back
				here.
			</p>
		)
	}
	const picked = new Set(ctx.types.map(t => t.id))
	const toggle = (typeId: string, on: boolean) =>
		onPick(
			ctx.candidates
				.filter(t => (t.id === typeId ? on : picked.has(t.id)))
				.map(t => t.id),
		)
	const setGroup = (ids: string[], on: boolean) =>
		onPick(
			ctx.candidates
				.filter(t => (ids.includes(t.id) ? on : picked.has(t.id)))
				.map(t => t.id),
		)
	const groups = [
		{
			key: 'new',
			title: 'Not in this event yet',
			types: ctx.candidates.filter(t => !t.listed),
		},
		{
			key: 'unfinished',
			title: 'In this event, not fully set up',
			types: ctx.candidates.filter(t => t.listed),
		},
	].filter(g => g.types.length > 0)

	return (
		<fieldset className="flex flex-col gap-5" disabled={disabled}>
			<legend className="sr-only">Participant types</legend>
			<p
				className="text-sm tabular-nums text-muted-foreground"
				aria-live="polite"
			>
				{picked.size === 0
					? `None of ${ctx.candidates.length} selected`
					: `${picked.size} of ${ctx.candidates.length} selected`}
			</p>
			{groups.map(g => {
				const ids = g.types.map(t => t.id)
				const all = ids.every(x => picked.has(x))
				return (
					<section
						key={g.key}
						aria-labelledby={`${id}-${g.key}`}
						className="flex flex-col gap-2"
					>
						<div className="flex items-baseline justify-between gap-3">
							<h3
								id={`${id}-${g.key}`}
								className="text-sm font-medium text-muted-foreground"
							>
								{g.title}{' '}
								<span className="tabular-nums">({g.types.length})</span>
							</h3>
							<button
								type="button"
								onClick={() => setGroup(ids, !all)}
								className="rounded-sm text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								{all ? 'Clear' : 'Select all'}
							</button>
						</div>
						<ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
							{g.types.map(t => {
								const on = picked.has(t.id)
								return (
									<li key={t.id}>
										<label
											htmlFor={`${id}-${t.id}`}
											className={cn(
												'flex h-full cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted/50',
												on && 'border-primary bg-primary/5 hover:bg-primary/10',
											)}
										>
											<Checkbox
												id={`${id}-${t.id}`}
												checked={on}
												onCheckedChange={v => toggle(t.id, v === true)}
												className="mt-0.5"
											/>
											<span className="flex min-w-0 flex-col">
												<span className="text-sm font-medium">{t.name}</span>
												{t.listed && (
													<span className="text-xs text-muted-foreground">
														No{' '}
														{t.missing
															.map(m => (m === 'badge' ? 'badge template' : m))
															.join(' or ')}
													</span>
												)}
											</span>
										</label>
									</li>
								)
							})}
						</ul>
					</section>
				)
			})}
			<p className="text-xs text-muted-foreground">
				Types are created under the tenant. Types this event already uses and
				has fully set up aren&rsquo;t listed.
			</p>
		</fieldset>
	)
}

/**
 * One template per type, with a picker on top that sets them all. Types that
 * already have one are listed but left alone.
 */
function PerTypePicker({
	ctx,
	noun,
	value,
	options,
	has,
	onChange,
	detail,
}: {
	ctx: AddTypeContext
	/** e.g. "workflow", "badge template" */
	noun: string
	value: Record<string, string>
	options: { value: string; label: string }[]
	has: (t: PickedType) => boolean
	onChange: (typeIds: string[], v: string) => void
	detail?: (t: PickedType) => React.ReactNode
}) {
	const need = ctx.types.filter(t => !has(t)).map(t => t.id)
	const chosen = new Set(need.map(t => value[t] ?? ''))
	const title = noun[0]!.toUpperCase() + noun.slice(1)
	return (
		<div className="flex flex-col gap-3">
			{need.length > 1 && (
				<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-muted/40 px-3 py-3">
					<div className="flex flex-col">
						<span className="text-sm font-medium">
							{title} for all {need.length} types
						</span>
						<span className="text-xs text-muted-foreground">
							Sets every type below. You can still change one on its own.
						</span>
					</div>
					<Pick
						label={`${title} for all ${need.length} types`}
						value={chosen.size === 1 ? [...chosen][0] : undefined}
						placeholder="Mixed"
						options={options}
						onChange={v => onChange(need, v)}
						className="w-full max-w-xs"
					/>
				</div>
			)}
			<ul className="flex flex-col divide-y rounded-lg border">
				{ctx.types.map(t => (
					<li key={t.id} className="flex flex-col gap-2 px-3 py-3">
						<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
							<span className="text-sm font-medium">{t.name}</span>
							{has(t) ? (
								<span className="text-xs text-muted-foreground">
									Already has a {noun}, kept as it is
								</span>
							) : (
								<Pick
									label={`${title} for ${t.name}`}
									value={value[t.id] ?? ''}
									options={options}
									onChange={v => onChange([t.id], v)}
									className="w-full max-w-xs"
								/>
							)}
						</div>
						{detail?.(t)}
					</li>
				))}
			</ul>
		</div>
	)
}

function WorkflowEditor({ ctx, plan, setPlan }: Props) {
	return (
		<PerTypePicker
			ctx={ctx}
			noun="workflow"
			value={plan.workflows}
			options={[
				...ctx.workflowTemplates.map(t => ({ value: t.id, label: t.name })),
				{ value: '', label: 'No workflow yet' },
			]}
			has={t => !!t.existing.workflow}
			onChange={(typeIds, templateId) =>
				setPlan(p => {
					const workflows = { ...p.workflows }
					for (const id of typeIds) workflows[id] = templateId
					// The access defaults depend on the workflows' steps.
					return { ...p, workflows, access: defaultAccess(ctx, workflows) }
				})
			}
			detail={t => {
				const steps = workflowSteps(ctx, plan.workflows, t)
				return (
					<p className="text-xs text-muted-foreground">
						{steps.length > 0
							? steps.map(s => s.name).join(' \u2192 ')
							: 'Without a workflow the portal doesn\u2019t offer this type. You can add one later on the Workflows tab.'}
					</p>
				)
			}}
		/>
	)
}

function BadgeEditor({ ctx, plan, setPlan }: Props) {
	return (
		<PerTypePicker
			ctx={ctx}
			noun="badge template"
			value={plan.badges}
			options={[
				...ctx.badgeTemplates.map(t => ({ value: t.id, label: t.name })),
				{ value: '', label: 'No badge template yet' },
			]}
			has={t => t.existing.badge}
			onChange={(typeIds, badgeId) =>
				setPlan(p => {
					const badges = { ...p.badges }
					for (const id of typeIds) badges[id] = badgeId
					return { ...p, badges }
				})
			}
		/>
	)
}

function AccessEditor({ ctx, plan, setPlan }: Props) {
	if (plan.access.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				{ctx.types.every(
					t => workflowSteps(ctx, plan.workflows, t).length === 0,
				)
					? 'Pick a workflow first.'
					: 'No active staff account has a role on these workflows’ steps.'}
			</p>
		)
	}
	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm text-muted-foreground">
				{ctx.types.some(t => t.existing.workflow)
					? 'Prefilled with the access existing workflows already have, which is kept, else the step each person works on in this event’s other workflows.'
					: 'Prefilled with the step each person works on in this event’s other workflows. People with no access to this event start with none.'}
				{ctx.types.length > 1 &&
					' Each person gets the step on every workflow that has it.'}
			</p>
			<div className="overflow-x-auto rounded-lg border">
				<table className="w-full text-sm">
					<thead className="bg-muted/40 text-left text-xs text-muted-foreground">
						<tr>
							<th className="px-3 py-2 font-medium">Staff</th>
							<th className="px-3 py-2 font-medium">Role</th>
							<th className="px-3 py-2 font-medium">Works on step</th>
						</tr>
					</thead>
					<tbody className="divide-y">
						{plan.access.map(a => {
							const user = ctx.staff.find(u => u.id === a.userId)
							if (!user) return null
							const steps = stepsForStaff(ctx, plan.workflows, a.userId)
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
										<Pick
											label={`Step for ${user.name}`}
											value={steps.includes(a.stepName) ? a.stepName : ''}
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

function QuotasEditor({ ctx, plan, setPlan }: Props) {
	const id = useId()
	const update = (
		restrictionId: string,
		patch: Partial<AddTypePlan['quotas'][number]>,
	) =>
		setPlan(p => ({
			...p,
			quotas: p.quotas.map(q =>
				q.restrictionId === restrictionId ? { ...q, ...patch } : q,
			),
		}))
	const invitations = plan.quotas
		.filter(q => q.enabled)
		.reduce(
			(n, q) =>
				n +
				(ctx.restrictions.find(r => r.id === q.restrictionId)?.invitations ??
					0),
			0,
		)

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted-foreground">
				Leave a restriction unticked if its invitations already cover{' '}
				{ctx.types.length === 1 ? 'this type' : 'these types'} through an
				&ldquo;Any&rdquo; quota.
				{ctx.types.length > 1 &&
					' Each ticked quota is added for every type, with the same number.'}
			</p>
			<ul className="flex flex-col divide-y rounded-lg border">
				{plan.quotas.map(q => {
					const r = ctx.restrictions.find(x => x.id === q.restrictionId)
					if (!r) return null
					const levels = openLevels(ctx, r)
					const skipped = ctx.types.filter(
						t => !typesForQuota(ctx, q).includes(t),
					)
					return (
						<li
							key={q.restrictionId}
							className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5"
						>
							<div className="flex min-w-48 flex-1 items-center gap-2.5 text-sm">
								<Checkbox
									id={`${id}-${q.restrictionId}`}
									checked={q.enabled}
									onCheckedChange={v =>
										update(q.restrictionId, { enabled: v === true })
									}
								/>
								<div className="flex flex-col">
									<label
										htmlFor={`${id}-${q.restrictionId}`}
										className="cursor-pointer font-medium"
									>
										{r.name}
									</label>
									<span className="text-xs text-muted-foreground">
										{r.invitations} invitation{r.invitations === 1 ? '' : 's'}
										{skipped.length > 0 &&
											`, already has a ${q.accessLevel.toLowerCase()} quota for ${ctx.types.length === 1 ? 'this type' : skipped.map(t => t.name).join(', ')}`}
									</span>
								</div>
							</div>
							<Pick
								label={`Access level in ${r.name}`}
								value={q.accessLevel}
								options={levels.map(l => ({
									value: l,
									label: l === 'OPEN' ? 'Open session' : 'Closed session',
								}))}
								onChange={v =>
									update(q.restrictionId, {
										accessLevel: v as 'OPEN' | 'CLOSED',
									})
								}
								className="w-40"
							/>
							<Input
								type="number"
								min={0}
								inputMode="numeric"
								aria-label={`Quota in ${r.name}`}
								value={q.quota}
								disabled={!q.enabled}
								onChange={e =>
									update(q.restrictionId, {
										quota: Math.max(0, Math.floor(Number(e.target.value) || 0)),
									})
								}
								className="h-9 w-24 tabular-nums"
							/>
						</li>
					)
				})}
			</ul>
			<div className="flex items-start gap-2.5 text-sm">
				<Checkbox
					id={`${id}-apply`}
					checked={plan.applyToInvitations}
					onCheckedChange={v =>
						setPlan(p => ({ ...p, applyToInvitations: v === true }))
					}
					className="mt-0.5"
				/>
				<div className="flex flex-col gap-0.5">
					<label htmlFor={`${id}-apply`} className="cursor-pointer font-medium">
						Also add these quotas to existing invitations
					</label>
					<span className="text-muted-foreground">
						Invitations keep their own copy of a restriction&rsquo;s quotas, so
						without this the {invitations} invitation
						{invitations === 1 ? '' : 's'} above won&rsquo;t get them. Quotas an
						invitation already has are left alone.
					</span>
				</div>
			</div>
		</div>
	)
}
