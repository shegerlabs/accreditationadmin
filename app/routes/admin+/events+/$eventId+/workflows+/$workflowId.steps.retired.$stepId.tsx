import { Action, type Prisma } from '@prisma/client'
import { LoaderFunctionArgs, json } from '@remix-run/node'
import {
	Form,
	Link,
	useLoaderData,
	useNavigate,
	useNavigation,
	useParams,
	useSearchParams,
} from '@remix-run/react'
import { ArchiveRestore, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '~/components/ui/sheet'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

const PAGE_SIZE = 20
const ACCESS_PREVIEW = 5

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const step = await prisma.step.findFirst({
		where: {
			id: params.stepId,
			workflowId: params.workflowId,
			retiredAt: { not: null },
			workflow: { event: getTenantFilter(user) },
		},
		select: {
			id: true,
			name: true,
			action: true,
			order: true,
			retiredAt: true,
			retiredLinks: true,
			nextStepId: true,
			requiresAssignment: true,
			role: { select: { name: true } },
		},
	})
	invariantResponse(step, 'Retired step not found', { status: 404 })

	const links = (step.retiredLinks ?? {}) as {
		predecessorIds?: string[]
		access?: { userId: string; roleId: string }[]
	}
	const predecessorIds = links.predecessorIds ?? []
	const access = links.access ?? []

	const url = new URL(request.url)
	const q = url.searchParams.get('q')?.trim() ?? ''
	const actionParam = url.searchParams.get('action')
	const action =
		actionParam && actionParam in Action ? (actionParam as Action) : null
	const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1)

	const terms = q.split(/\s+/).filter(Boolean)
	const historyWhere: Prisma.ApprovalWhereInput = {
		stepId: step.id,
		...(action && { action }),
		// Every word must match the participant's name or the actor's name.
		AND: terms.map(term => ({
			OR: [
				{ participant: { firstName: { contains: term, mode: 'insensitive' } } },
				{
					participant: { familyName: { contains: term, mode: 'insensitive' } },
				},
				{ user: { name: { contains: term, mode: 'insensitive' } } },
				{ user: { username: { contains: term, mode: 'insensitive' } } },
			],
		})),
	}
	const matching = await prisma.approval.count({ where: historyWhere })
	const pageCount = Math.max(1, Math.ceil(matching / PAGE_SIZE))
	const page = Math.min(requestedPage, pageCount)

	const [linked, accessUsers, accessRoles, byAction, history, waiting] =
		await Promise.all([
			prisma.step.findMany({
				where: {
					id: {
						in: [
							...predecessorIds,
							...(step.nextStepId ? [step.nextStepId] : []),
						],
					},
				},
				select: { id: true, name: true, retiredAt: true },
			}),
			prisma.user.findMany({
				where: { id: { in: access.map(a => a.userId) } },
				select: { id: true, name: true, username: true },
			}),
			prisma.role.findMany({
				where: { id: { in: access.map(a => a.roleId) } },
				select: { id: true, name: true },
			}),
			prisma.approval.groupBy({
				by: ['action'],
				where: { stepId: step.id },
				_count: { _all: true },
			}),
			prisma.approval.findMany({
				where: historyWhere,
				select: {
					id: true,
					action: true,
					result: true,
					remarks: true,
					createdAt: true,
					user: { select: { name: true, username: true } },
					participant: {
						select: { id: true, firstName: true, familyName: true },
					},
				},
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
				skip: (page - 1) * PAGE_SIZE,
				take: PAGE_SIZE,
			}),
			prisma.participant.count({ where: { stepId: step.id } }),
		])

	const stepName = (id: string) => {
		const s = linked.find(l => l.id === id)
		return s ? { name: s.name, retired: Boolean(s.retiredAt) } : null
	}
	const users = new Map(accessUsers.map(u => [u.id, u.name || u.username]))
	const roles = new Map(accessRoles.map(r => [r.id, r.name]))

	return json({
		step: {
			id: step.id,
			name: step.name,
			action: step.action,
			order: step.order,
			role: step.role.name,
			requiresAssignment: step.requiresAssignment,
			retiredAt: step.retiredAt!,
		},
		predecessors: predecessorIds.map(id => stepName(id)),
		next: step.nextStepId ? stepName(step.nextStepId) : null,
		access: access.map(a => ({
			user: users.get(a.userId) ?? null,
			role: roles.get(a.roleId) ?? null,
		})),
		hasSavedPlace: step.retiredLinks !== null,
		byAction: byAction
			.map(a => ({ action: a.action, count: a._count._all }))
			.sort((a, b) => b.count - a.count),
		total: byAction.reduce((n, a) => n + a._count._all, 0),
		history,
		filter: { q, action },
		matching,
		page,
		pageCount,
		waiting,
	})
}

const ACTION_LABELS: Record<string, string> = {
	APPROVE: 'Approved',
	REJECT: 'Rejected',
	PRINT: 'Printed',
	COLLECT: 'Collected',
	NOTIFY: 'Notified',
	ARCHIVE: 'Archived',
	BYPASS: 'Bypassed',
	MOVE: 'Moved',
}

export default function RetiredStepRoute() {
	const {
		step,
		predecessors,
		next,
		access,
		hasSavedPlace,
		byAction,
		total,
		history,
		filter,
		matching,
		page,
		pageCount,
		waiting,
	} = useLoaderData<typeof loader>()
	const { eventId, workflowId } = useParams()
	const navigate = useNavigate()
	const navigation = useNavigation()
	const [searchParams] = useSearchParams()
	const [showAllAccess, setShowAllAccess] = useState(false)
	const stepsUrl = `/admin/events/${eventId}/workflows/${workflowId}/steps`
	const loading =
		navigation.state === 'loading' &&
		navigation.location.pathname === `${stepsUrl}/retired/${step.id}`

	// Same page, with some search params changed. null removes a param, and
	// any filter change goes back to page 1.
	const withParams = (changes: Record<string, string | null>) => {
		const next = new URLSearchParams(searchParams)
		if (!('page' in changes)) next.delete('page')
		for (const [key, value] of Object.entries(changes))
			value === null ? next.delete(key) : next.set(key, value)
		const query = next.toString()
		return query ? `?${query}` : '.'
	}
	const shownAccess = showAllAccess ? access : access.slice(0, ACCESS_PREVIEW)

	return (
		<Sheet open onOpenChange={open => !open && navigate(stepsUrl)}>
			<SheetContent
				className="overflow-y-auto sm:max-w-lg"
				onOpenAutoFocus={e => e.preventDefault()}
			>
				<SheetHeader>
					<SheetTitle className="flex items-center gap-2">
						{step.name}
						<Badge variant="secondary">Retired</Badge>
					</SheetTitle>
					<SheetDescription>
						Retired on {new Date(step.retiredAt).toLocaleString()}. It is out of
						the workflow and kept so past approvals still show where they
						happened.
					</SheetDescription>
				</SheetHeader>

				<div className="mt-6 space-y-6 text-sm">
					<dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
						<dt className="text-muted-foreground">Action</dt>
						<dd>{step.action}</dd>
						<dt className="text-muted-foreground">Role</dt>
						<dd>{step.role}</dd>
						<dt className="text-muted-foreground">Order</dt>
						<dd>{step.order}</dd>
						<dt className="text-muted-foreground">Requires assignment</dt>
						<dd>{step.requiresAssignment ? 'Yes' : 'No'}</dd>
						{waiting > 0 && (
							<>
								<dt className="text-muted-foreground">Waiting here</dt>
								<dd className="text-destructive">
									{waiting} participant{waiting === 1 ? '' : 's'}.{' '}
									<Link
										to={`${stepsUrl}/move?from=${step.id}`}
										className="underline"
									>
										Move them
									</Link>
								</dd>
							</>
						)}
					</dl>

					<section className="space-y-2">
						<h3 className="font-medium">Where it sat</h3>
						{hasSavedPlace ? (
							<ul className="space-y-1 text-muted-foreground">
								<li>
									After:{' '}
									<StepNames
										steps={predecessors}
										empty="nothing (it was the first step)"
									/>
								</li>
								<li>
									Before:{' '}
									<StepNames
										steps={next ? [next] : []}
										empty="nothing (it was the last step)"
									/>
								</li>
							</ul>
						) : (
							<p className="text-muted-foreground">
								Not recorded. This step was retired before positions were saved,
								so after restoring, set it as the next step of the step before
								it.
							</p>
						)}
					</section>

					{hasSavedPlace && (
						<section className="space-y-2">
							<h3 className="font-medium">Access restored with it</h3>
							{access.length === 0 ? (
								<p className="text-muted-foreground">Nobody had access.</p>
							) : (
								<ul className="space-y-1">
									{shownAccess.map((a, i) => (
										<li key={i}>
											{a.user ?? (
												<span className="text-muted-foreground">
													Deleted user
												</span>
											)}
											{a.role && (
												<span className="text-muted-foreground">
													{' '}
													· {a.role}
												</span>
											)}
										</li>
									))}
									{access.length > ACCESS_PREVIEW && (
										<li>
											<button
												type="button"
												className="text-muted-foreground underline"
												onClick={() => setShowAllAccess(v => !v)}
											>
												{showAllAccess
													? 'Show fewer'
													: `Show all ${access.length}`}
											</button>
										</li>
									)}
								</ul>
							)}
						</section>
					)}

					<section className="space-y-2">
						<h3 className="font-medium">
							History at this step{' '}
							<span className="font-normal text-muted-foreground">
								({total})
							</span>
						</h3>
						{total === 0 ? (
							<p className="text-muted-foreground">No approvals recorded.</p>
						) : (
							<>
								{/* One kind of action means nothing to filter. A stale
								    ?action= still shows chips so it can be cleared. */}
								{(byAction.length > 1 || filter.action) && (
									<div className="flex flex-wrap gap-2">
										<FilterChip
											to={withParams({ action: null })}
											active={!filter.action}
										>
											All · {total}
										</FilterChip>
										{byAction.map(a => (
											<FilterChip
												key={a.action}
												to={withParams({ action: a.action })}
												active={filter.action === a.action}
											>
												{ACTION_LABELS[a.action] ?? a.action} · {a.count}
											</FilterChip>
										))}
									</div>
								)}
								<Form
									method="GET"
									replace
									preventScrollReset
									className="relative"
								>
									{filter.action && (
										<input type="hidden" name="action" value={filter.action} />
									)}
									<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										key={filter.q}
										type="search"
										name="q"
										defaultValue={filter.q}
										aria-label="Search history"
										placeholder="Search by participant or validator, then press Enter"
										className="pl-9"
									/>
								</Form>
								{history.length === 0 ? (
									<p className="py-4 text-center text-muted-foreground">
										Nothing matches
										{filter.q ? ` “${filter.q}”` : ''}.{' '}
										<Link
											to={withParams({ q: null, action: null })}
											replace
											preventScrollReset
											className="underline"
										>
											Clear filters
										</Link>
									</p>
								) : (
									<ul
										className={`divide-y rounded-md border transition-opacity ${loading ? 'opacity-50' : ''}`}
									>
										{history.map(a => (
											<li key={a.id} className="space-y-0.5 px-3 py-2">
												<div className="flex items-baseline justify-between gap-2">
													<Link
														to={`/admin/participants/${a.participant.id}`}
														className="font-medium hover:underline"
													>
														{a.participant.firstName} {a.participant.familyName}
													</Link>
													<span className="shrink-0 text-xs text-muted-foreground">
														{new Date(a.createdAt).toLocaleString()}
													</span>
												</div>
												<div className="text-muted-foreground">
													{ACTION_LABELS[a.action] ?? a.action}
													{a.result === 'FAILURE' ? ' (failed)' : ''} by{' '}
													{a.user.name || a.user.username}
												</div>
												{a.remarks && (
													<div className="text-xs text-muted-foreground">
														{a.remarks}
													</div>
												)}
											</li>
										))}
									</ul>
								)}
								{pageCount > 1 && (
									<div className="flex items-center justify-between gap-2">
										<span className="text-xs tabular-nums text-muted-foreground">
											{(page - 1) * PAGE_SIZE + 1}–
											{(page - 1) * PAGE_SIZE + history.length} of {matching}
										</span>
										<div className="flex items-center gap-1">
											<PageLink
												to={withParams({ page: String(page - 1) })}
												disabled={page <= 1}
												label="Previous page"
											>
												<ChevronLeft className="h-4 w-4" />
											</PageLink>
											<span className="px-2 text-xs tabular-nums text-muted-foreground">
												Page {page} of {pageCount}
											</span>
											<PageLink
												to={withParams({ page: String(page + 1) })}
												disabled={page >= pageCount}
												label="Next page"
											>
												<ChevronRight className="h-4 w-4" />
											</PageLink>
										</div>
									</div>
								)}
							</>
						)}
					</section>

					<div className="flex justify-end gap-2 border-t pt-4">
						<Button asChild variant="outline">
							<Link to={stepsUrl}>Close</Link>
						</Button>
						<Button asChild>
							<Link to={`${stepsUrl}/${step.id}/restore`}>
								<ArchiveRestore className="mr-1 h-4 w-4" />
								Restore
							</Link>
						</Button>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	)
}

function StepNames({
	steps,
	empty,
}: {
	steps: ({ name: string; retired: boolean } | null)[]
	empty: string
}) {
	if (steps.length === 0) return <>{empty}</>
	return (
		<>
			{steps.map((s, i) => (
				<span key={i}>
					{i > 0 && ', '}
					<span className="text-foreground">{s?.name ?? 'a deleted step'}</span>
					{s?.retired && ' (now retired)'}
				</span>
			))}
		</>
	)
}

function FilterChip({
	to,
	active,
	children,
}: {
	to: string
	active: boolean
	children: React.ReactNode
}) {
	return (
		<Link
			to={to}
			replace
			preventScrollReset
			aria-current={active ? 'true' : undefined}
		>
			<Badge variant={active ? 'default' : 'outline'}>{children}</Badge>
		</Link>
	)
}

function PageLink({
	to,
	disabled,
	label,
	children,
}: {
	to: string
	disabled: boolean
	label: string
	children: React.ReactNode
}) {
	if (disabled)
		return (
			<Button variant="outline" size="icon" className="h-8 w-8" disabled>
				{children}
				<span className="sr-only">{label}</span>
			</Button>
		)
	return (
		<Button asChild variant="outline" size="icon" className="h-8 w-8">
			<Link to={to} replace preventScrollReset aria-label={label}>
				{children}
			</Link>
		</Button>
	)
}
