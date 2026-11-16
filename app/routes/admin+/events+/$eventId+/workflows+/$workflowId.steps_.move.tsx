import {
	AuditAction,
	AuditEntityType,
	type RequestStatus as Status,
} from '@prisma/client'
import {
	ActionFunctionArgs,
	LoaderFunctionArgs,
	SerializeFrom,
	json,
} from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useLoaderData,
	useParams,
	useSearchParams,
} from '@remix-run/react'
import { ArrowRight, ChevronLeft, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { ErrorList } from '~/components/forms'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { StatusButton } from '~/components/ui/status-button'
import { Textarea } from '~/components/ui/textarea'
import { auditRequest } from '~/utils/audit.server'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse, useIsPending } from '~/utils/misc'
import {
	StepLifecycleError,
	moveParticipants,
} from '~/utils/step-lifecycle.server'
import { redirectWithToast } from '~/utils/toast.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const workflow = await prisma.workflow.findFirst({
		where: { id: params.workflowId, event: getTenantFilter(user) },
		select: { id: true, name: true },
	})
	invariantResponse(workflow, 'Workflow not found', { status: 404 })

	const [steps, counts] = await Promise.all([
		prisma.step.findMany({
			where: {
				workflowId: workflow.id,
				action: { notIn: ['REJECT', 'BYPASS'] },
			},
			select: { id: true, name: true, retiredAt: true },
			orderBy: { order: 'asc' },
		}),
		prisma.participant.groupBy({
			by: ['stepId'],
			where: { step: { workflowId: workflow.id } },
			_count: { _all: true },
		}),
	])

	const countAt = new Map(counts.map(c => [c.stepId, c._count._all]))
	const stepList = steps
		.map(s => ({
			id: s.id,
			name: s.name,
			retired: Boolean(s.retiredAt),
			count: countAt.get(s.id) ?? 0,
		}))
		// A retired step should be empty, but if anyone landed on one, it has to
		// be listed as a source or they could never be moved off it.
		.filter(s => !s.retired || s.count > 0)

	const occupied = stepList.filter(s => s.count > 0)
	const requested = new URL(request.url).searchParams.get('from')
	const fromId =
		occupied.find(s => s.id === requested)?.id ?? occupied[0]?.id ?? null

	const participants = fromId
		? await prisma.participant.findMany({
				where: { stepId: fromId },
				select: {
					id: true,
					firstName: true,
					familyName: true,
					organization: true,
					status: true,
					deletedAt: true,
					country: { select: { name: true } },
				},
				orderBy: [{ familyName: 'asc' }, { firstName: 'asc' }],
			})
		: []

	return json({ workflow, steps: stepList, fromId, participants })
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const reason = formData.get('reason')?.toString().trim().slice(0, 500)

	try {
		const { from, to, participantIds, skipped } = await moveParticipants({
			fromStepId: formData.get('from')?.toString() ?? '',
			toStepId: formData.get('to')?.toString() ?? '',
			participantIds:
				formData.get('scope') === 'all'
					? 'all'
					: [...new Set(formData.getAll('participantId').map(String))],
			reason: reason || undefined,
			userId: user.id,
			tenantFilter: getTenantFilter(user),
		})
		const moved = participantIds.length
		await auditRequest({
			request,
			action: AuditAction.UPDATE,
			entityType: AuditEntityType.WORKFLOW,
			entityId: from.workflowId,
			description: `Moved ${plural(moved, 'participant')} from "${from.name}" to "${to.name}"`,
			userId: user.id,
			tenantId: from.tenantId,
			metadata: {
				fromStep: { id: from.id, name: from.name },
				toStep: { id: to.id, name: to.name },
				scope: formData.get('scope') === 'all' ? 'all' : 'some',
				reason,
				participantIds,
			},
		})
		return redirectWithToast(
			`/admin/events/${params.eventId}/workflows/${params.workflowId}/steps`,
			{
				type: 'success',
				title: 'Participants Moved',
				description:
					`${plural(moved, 'participant')} moved to "${to.name}".` +
					(skipped
						? ` ${plural(skipped, 'other')} had already left "${from.name}" and ${skipped === 1 ? 'was' : 'were'} not moved.`
						: ''),
			},
		)
	} catch (error) {
		if (error instanceof StepLifecycleError)
			return json({ error: error.message }, { status: 400 })
		throw error
	}
}

function plural(n: number, word: string) {
	return `${n} ${word}${n === 1 ? '' : 's'}`
}

const STATUS_LABELS: Record<Status, string> = {
	PENDING: 'Pending',
	INPROGRESS: 'In Progress',
	APPROVED: 'Approved',
	REJECTED: 'Rejected',
	CANCELLED: 'Cancelled',
	PRINTED: 'Printed',
	COLLECTED: 'Collected',
	NOTIFIED: 'Notified',
	ARCHIVED: 'Archived',
	BYPASSED: 'Bypassed',
}

export default function MoveParticipantsRoute() {
	const { workflow, steps, fromId, participants } =
		useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const [, setSearchParams] = useSearchParams()
	const { eventId, workflowId } = useParams()
	const stepsUrl = `/admin/events/${eventId}/workflows/${workflowId}/steps`
	const occupied = steps.filter(s => s.count > 0)

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
				<div className="space-y-1.5">
					<CardTitle>Move participants</CardTitle>
					<CardDescription>
						Move participants waiting at one step of {workflow.name} to another,
						for example when a validation level is added or removed during
						registration. Their status stays the same, and the move is recorded
						in each participant’s history.
					</CardDescription>
				</div>
				<Button asChild variant="outline" size="sm">
					<Link to={stepsUrl}>
						<ChevronLeft className="mr-1 h-4 w-4" />
						Back
					</Link>
				</Button>
			</CardHeader>
			<CardContent>
				{!fromId ? (
					<p className="text-sm text-muted-foreground">
						Nobody is in this workflow yet.
					</p>
				) : (
					<Form method="POST" className="space-y-6">
						<AuthenticityTokenInput />
						<HoneypotInputs />

						<div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
							<div className="space-y-2">
								<Label htmlFor="move-from">From</Label>
								<Select
									name="from"
									value={fromId}
									onValueChange={id =>
										setSearchParams({ from: id }, { preventScrollReset: true })
									}
								>
									<SelectTrigger id="move-from">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{occupied.map(s => (
											<SelectItem key={s.id} value={s.id}>
												{s.name}
												{s.retired ? ' (retired)' : ''} · {s.count}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<ArrowRight className="mb-2.5 hidden h-4 w-4 text-muted-foreground sm:block" />
							<div className="space-y-2">
								<Label htmlFor="move-to">To</Label>
								<Select name="to" key={fromId}>
									<SelectTrigger id="move-to">
										<SelectValue placeholder="Choose a step" />
									</SelectTrigger>
									<SelectContent>
										{steps
											.filter(s => !s.retired && s.id !== fromId)
											.map(s => (
												<SelectItem key={s.id} value={s.id}>
													{s.name}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							</div>
						</div>

						{/* Keyed so the selection starts empty for each source step. */}
						<ParticipantPicker
							key={fromId}
							participants={participants}
							error={actionData?.error}
						/>
					</Form>
				)}
			</CardContent>
		</Card>
	)
}

function ParticipantPicker({
	participants,
	error,
}: {
	participants: SerializeFrom<typeof loader>['participants']
	error?: string
}) {
	const isPending = useIsPending()
	const [scope, setScope] = useState<'all' | 'some'>('all')
	const [query, setQuery] = useState('')
	const [selected, setSelected] = useState<Set<string>>(new Set())

	const shown = useMemo(() => {
		const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
		if (terms.length === 0) return participants
		return participants.filter(p => {
			const text = [
				p.firstName,
				p.familyName,
				p.organization,
				p.country.name,
				STATUS_LABELS[p.status],
				p.deletedAt ? 'trash' : '',
			]
				.join(' ')
				.toLowerCase()
			return terms.every(t => text.includes(t))
		})
	}, [participants, query])

	const moveCount = scope === 'all' ? participants.length : selected.size
	const shownSelected = shown.filter(p => selected.has(p.id)).length
	const allShown = shown.length > 0 && shownSelected === shown.length

	const toggleShown = () =>
		setSelected(prev => {
			const next = new Set(prev)
			for (const p of shown) allShown ? next.delete(p.id) : next.add(p.id)
			return next
		})
	const toggle = (id: string) =>
		setSelected(prev => {
			const next = new Set(prev)
			next.has(id) ? next.delete(id) : next.add(id)
			return next
		})

	return (
		<>
			<fieldset className="space-y-3">
				<legend className="text-sm font-medium">Who to move</legend>
				<RadioGroup
					name="scope"
					value={scope}
					onValueChange={v => setScope(v as 'all' | 'some')}
					className="gap-3"
				>
					<div className="flex items-center gap-2">
						<RadioGroupItem value="all" id="scope-all" />
						<Label htmlFor="scope-all" className="font-normal">
							All participants at this step ({participants.length})
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<RadioGroupItem value="some" id="scope-some" />
						<Label htmlFor="scope-some" className="font-normal">
							Some participants
						</Label>
					</div>
				</RadioGroup>
				{scope === 'some' && (
					<>
						{[...selected].map(id => (
							<input key={id} type="hidden" name="participantId" value={id} />
						))}
						<div className="relative">
							<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								type="search"
								aria-label="Search participants"
								placeholder="Search by name, organisation, country or status"
								value={query}
								onChange={e => setQuery(e.target.value)}
								className="pl-9"
							/>
						</div>
						<div className="rounded-md border">
							<label className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2 text-sm">
								<Checkbox
									checked={
										allShown
											? true
											: shownSelected > 0
												? 'indeterminate'
												: false
									}
									onCheckedChange={toggleShown}
									disabled={shown.length === 0}
								/>
								<span className="font-medium">
									{query ? `Select all ${shown.length} shown` : 'Select all'}
								</span>
								<span className="ml-auto tabular-nums text-muted-foreground">
									{selected.size} of {participants.length} selected
								</span>
							</label>
							<ul className="max-h-[28rem] divide-y overflow-y-auto">
								{shown.length === 0 && (
									<li className="px-4 py-6 text-center text-sm text-muted-foreground">
										No participants match “{query}”.
									</li>
								)}
								{shown.map(p => (
									<li key={p.id}>
										<label className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-muted/40">
											<Checkbox
												checked={selected.has(p.id)}
												onCheckedChange={() => toggle(p.id)}
											/>
											<span className="min-w-0 flex-1">
												<span className="font-medium">
													{p.firstName} {p.familyName}
												</span>
												<span className="block truncate text-muted-foreground">
													{p.organization} · {p.country.name}
												</span>
											</span>
											{p.deletedAt && <Badge variant="outline">In trash</Badge>}
											<Badge variant="secondary">
												{STATUS_LABELS[p.status]}
											</Badge>
										</label>
									</li>
								))}
							</ul>
						</div>
					</>
				)}
			</fieldset>

			<div className="space-y-2">
				<Label htmlFor="move-reason">Reason (optional)</Label>
				<Textarea
					id="move-reason"
					name="reason"
					maxLength={500}
					rows={2}
					placeholder="e.g. Organisers added a second validation level"
				/>
			</div>

			<ErrorList errors={error ? [error] : []} />

			<div className="flex justify-end">
				<StatusButton
					type="submit"
					disabled={isPending || moveCount === 0}
					status={isPending ? 'pending' : 'idle'}
				>
					{scope === 'all'
						? `Move all ${plural(moveCount, 'participant')}`
						: `Move ${plural(moveCount, 'participant')}`}
				</StatusButton>
			</div>
		</>
	)
}
