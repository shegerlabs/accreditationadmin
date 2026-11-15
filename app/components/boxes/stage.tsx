import { initials, STAGE_META, STAGES, type Stage } from '~/utils/boxes'
import { cn } from '~/utils/misc'

/**
 * `stages` limits what's drawn; the bar then spans only those, so it never
 * shows space for people the legend doesn't name.
 */
export function StageBar({
	counts,
	total,
	stages = STAGES,
	className,
}: {
	counts: Record<Stage, number>
	total: number
	stages?: Stage[]
	className?: string
}) {
	const span =
		stages === STAGES ? total : stages.reduce((n, s) => n + counts[s], 0)
	return (
		<div
			className={cn(
				'flex h-1.5 w-full overflow-hidden rounded-full bg-muted',
				className,
			)}
			role="img"
			aria-label={stages
				.filter(s => counts[s])
				.map(s => `${counts[s]} ${STAGE_META[s].label.toLowerCase()}`)
				.join(', ')}
		>
			{stages.map(s =>
				counts[s] ? (
					<div
						key={s}
						className={STAGE_META[s].dot}
						style={{ width: `${(counts[s] / Math.max(span, 1)) * 100}%` }}
					/>
				) : null,
			)}
		</div>
	)
}

export function StageLegend({
	counts,
	stages = STAGES,
}: {
	counts: Record<Stage, number>
	stages?: Stage[]
}) {
	return (
		<ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
			{stages
				.filter(s => counts[s])
				.map(s => (
					<li key={s} className="flex items-center gap-1.5">
						<span className={cn('h-2 w-2 rounded-full', STAGE_META[s].dot)} />
						<span className="tabular-nums">{counts[s]}</span>{' '}
						{STAGE_META[s].label}
					</li>
				))}
		</ul>
	)
}

export function StagePill({ stage }: { stage: Stage }) {
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
				STAGE_META[stage].pill,
			)}
		>
			{STAGE_META[stage].label}
		</span>
	)
}

export function Initials({
	p,
}: {
	p: { firstName: string; familyName: string }
}) {
	return (
		<span
			className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
			aria-hidden="true"
		>
			{initials(p)}
		</span>
	)
}

export function personName(p: { firstName: string; familyName: string }) {
	return `${p.familyName.toUpperCase()}, ${p.firstName}`
}
