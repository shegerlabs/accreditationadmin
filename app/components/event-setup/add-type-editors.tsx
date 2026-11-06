// Editors for the add-participant-type wizard, one per section.
// Decision record: docs/decisions/2026-11-06-event-participant-types.md

import { useId } from 'react'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import {
	type AddTypeContext,
	type AddTypePlan,
	type AddTypeSectionKey,
	defaultAccess,
	stepsForStaff,
	workflowSteps,
} from '~/utils/add-participant-type'
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

/** The first step: which type to add. Picking one reloads the page for it. */
export function TypePicker({
	ctx,
	onPick,
	disabled,
}: {
	ctx: AddTypeContext
	onPick: (typeId: string) => void
	disabled?: boolean
}) {
	if (ctx.candidates.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Every one of the tenant&rsquo;s participant types is already set up for
				this event. Create a new type under the tenant first, then come back
				here.
			</p>
		)
	}
	const describe = (t: AddTypeContext['candidates'][number]) =>
		!t.listed
			? 'Not in this event yet'
			: `In this event, no ${t.missing.map(m => (m === 'badge' ? 'badge template' : m)).join(' or ')}`
	return (
		<fieldset className="flex flex-col gap-3" disabled={disabled}>
			<legend className="sr-only">Participant type</legend>
			<ul className="flex flex-col divide-y rounded-lg border">
				{ctx.candidates.map(t => (
					<li key={t.id}>
						<label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
							<input
								type="radio"
								name="type"
								value={t.id}
								checked={ctx.type?.id === t.id}
								onChange={() => onPick(t.id)}
								className="h-4 w-4 accent-primary"
							/>
							<span className="flex-1 text-sm font-medium">{t.name}</span>
							<span className="text-xs text-muted-foreground">
								{describe(t)}
							</span>
						</label>
					</li>
				))}
			</ul>
			<p className="text-xs text-muted-foreground">
				Types are created under the tenant. Only types this event doesn&rsquo;t
				use yet, or hasn&rsquo;t finished setting up, are listed.
			</p>
		</fieldset>
	)
}

function WorkflowEditor({ ctx, plan, setPlan }: Props) {
	const steps = workflowSteps(ctx, plan)
	return (
		<div className="flex flex-col gap-3">
			<Pick
				label={`Workflow for ${ctx.type?.name}`}
				value={plan.workflow}
				options={[
					...ctx.workflowTemplates.map(t => ({ value: t.id, label: t.name })),
					{ value: '', label: 'No workflow yet' },
				]}
				// The access defaults depend on the workflow's steps.
				onChange={v =>
					setPlan(p => ({ ...p, workflow: v, access: defaultAccess(ctx, v) }))
				}
				className="w-full max-w-sm"
			/>
			{steps.length > 0 ? (
				<ol className="flex flex-col gap-1 text-sm">
					{steps.map((s, n) => (
						<li key={`${s.name}-${n}`} className="flex gap-2">
							<span className="w-5 text-right tabular-nums text-muted-foreground">
								{n + 1}.
							</span>
							<span>{s.name}</span>
							{s.role && (
								<span className="capitalize text-muted-foreground">
									({s.role})
								</span>
							)}
						</li>
					))}
				</ol>
			) : (
				<p className="text-sm text-muted-foreground">
					Without a workflow the portal doesn&rsquo;t offer this type. You can
					add one later on the Workflows tab.
				</p>
			)}
		</div>
	)
}

function BadgeEditor({ ctx, plan, setPlan }: Props) {
	return (
		<Pick
			label={`Badge for ${ctx.type?.name}`}
			value={plan.badge}
			options={[
				...ctx.badgeTemplates.map(t => ({ value: t.id, label: t.name })),
				{ value: '', label: 'No badge template yet' },
			]}
			onChange={v => setPlan(p => ({ ...p, badge: v }))}
			className="w-full max-w-sm"
		/>
	)
}

function AccessEditor({ ctx, plan, setPlan }: Props) {
	if (plan.access.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				{workflowSteps(ctx, plan).length === 0
					? 'Pick a workflow first.'
					: 'No active staff account has a role on this workflow’s steps.'}
			</p>
		)
	}
	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm text-muted-foreground">
				{ctx.existing.workflow
					? 'Prefilled with the access this workflow already has, which is kept.'
					: 'Prefilled with the step each person works on in this event’s other workflows. People with no access to this event start with none.'}
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
							const steps = stepsForStaff(ctx, plan, a.userId)
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
				Leave a restriction unticked if its invitations already cover this type
				through an &ldquo;Any&rdquo; quota.
			</p>
			<ul className="flex flex-col divide-y rounded-lg border">
				{plan.quotas.map(q => {
					const r = ctx.restrictions.find(x => x.id === q.restrictionId)
					if (!r) return null
					const levels = (['OPEN', 'CLOSED'] as const).filter(
						l => !r.existingLevels.includes(l),
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
										{r.existingLevels.length > 0 &&
											`, already has a ${r.existingLevels[0]!.toLowerCase()} quota for this type`}
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
