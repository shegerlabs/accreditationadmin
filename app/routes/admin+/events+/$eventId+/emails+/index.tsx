import {
	AuditAction,
	AuditEntityType,
	EmailStatus,
	EmailTrigger,
	type Prisma,
} from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import {
	Form,
	Link,
	useLoaderData,
	useLocation,
	useNavigation,
	useSearchParams,
} from '@remix-run/react'
import { format } from 'date-fns'
import { HistoryIcon, RotateCwIcon } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { Paginator } from '~/components/paginator'
import { SearchBar } from '~/components/search-bar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { auditRequest } from '~/utils/audit.server'
import { requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import {
	EMAIL_TEMPLATE_DEFAULTS,
	EMAIL_TRIGGERS,
} from '~/utils/participant-email'
import {
	getEmailsToRetry,
	resendEmail,
	retryFailedEmails,
} from '~/utils/participant-email.server'
import { redirectWithToast } from '~/utils/toast.server'

const PAGE_SIZE_OPTIONS = [25, 50, 100]
const DEFAULT_PAGE_SIZE = 25

async function getEvent(request: Request, eventId: string | undefined) {
	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: { id: true, tenantId: true },
	})
	invariantResponse(event, 'Not Found', { status: 404 })
	const user = await requireAdminAccess(request, event.tenantId)
	return { event, user }
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { event } = await getEvent(request, params.eventId)

	const url = new URL(request.url)
	const statusParam = url.searchParams.get('status')
	const triggerParam = url.searchParams.get('trigger')
	const q = url.searchParams.get('search')?.trim() ?? ''
	const status = Object.values(EmailStatus).find(s => s === statusParam)
	const trigger = Object.values(EmailTrigger).find(t => t === triggerParam)
	const pageSize = PAGE_SIZE_OPTIONS.includes(
		Number(url.searchParams.get('pageSize')),
	)
		? Number(url.searchParams.get('pageSize'))
		: DEFAULT_PAGE_SIZE
	const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1)

	const eventWhere: Prisma.EmailLogWhereInput = {
		participant: { eventId: event.id },
	}
	const where: Prisma.EmailLogWhereInput = {
		...eventWhere,
		...(status ? { status } : {}),
		...(trigger ? { trigger } : {}),
		...(q
			? {
					OR: [
						{ recipient: { contains: q, mode: 'insensitive' } },
						{
							participant: { firstName: { contains: q, mode: 'insensitive' } },
						},
						{
							participant: { familyName: { contains: q, mode: 'insensitive' } },
						},
					],
				}
			: {}),
	}

	const [total, statusCounts, toRetry] = await Promise.all([
		prisma.emailLog.count({ where }),
		prisma.emailLog.groupBy({
			by: ['status'],
			where: eventWhere,
			_count: true,
		}),
		getEmailsToRetry(event.id),
	])
	const totalPages = Math.max(1, Math.ceil(total / pageSize))
	// Changing a filter keeps the old ?page, which can be past the new last page.
	const page = Math.min(requestedPage, totalPages)

	const emails = await prisma.emailLog.findMany({
		where,
		orderBy: { createdAt: 'desc' },
		skip: (page - 1) * pageSize,
		take: pageSize,
		select: {
			id: true,
			trigger: true,
			recipient: true,
			subject: true,
			body: true,
			status: true,
			error: true,
			createdAt: true,
			triggeredBy: { select: { username: true } },
			participant: {
				select: { id: true, firstName: true, familyName: true },
			},
		},
	})

	const counts = Object.fromEntries(
		Object.values(EmailStatus).map(s => [
			s,
			statusCounts.find(c => c.status === s)?._count ?? 0,
		]),
	) as Record<EmailStatus, number>

	return json({
		emails,
		counts,
		retryCount: toRetry.length,
		totalPages,
		currentPage: page,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const { event, user } = await getEvent(request, params.eventId)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	// Keep the admin's filters and page, minus Remix's ?index marker.
	const url = new URL(request.url)
	url.searchParams.delete('index')
	const search = url.searchParams.toString()
	const redirectTo = `${url.pathname}${search ? `?${search}` : ''}`

	if (formData.get('intent') === 'retry-failed') {
		const count = await retryFailedEmails(event.id, user.id)
		await auditRequest({
			request,
			action: AuditAction.OTHER,
			entityType: AuditEntityType.EVENT,
			entityId: event.id,
			description: `Retried ${count} failed email${count === 1 ? '' : 's'}`,
			userId: user.id,
			tenantId: event.tenantId,
			metadata: { count },
		})
		return redirectWithToast(redirectTo, {
			type: count ? 'success' : 'message',
			title: count ? 'Retrying failed emails' : 'Nothing to retry',
			description: count
				? `Sending ${count} email${count === 1 ? '' : 's'} again, one at a time. Refresh to see their status.`
				: 'Every failed email has since been sent or is already being resent.',
		})
	}

	const emailLogId = formData.get('emailLogId')
	invariantResponse(typeof emailLogId === 'string', 'Email not found', {
		status: 400,
	})
	const emailLog = await prisma.emailLog.findFirst({
		where: { id: emailLogId, participant: { eventId: event.id } },
		select: { id: true, participantId: true },
	})
	invariantResponse(emailLog, 'Email not found', { status: 404 })

	const resent = await resendEmail(emailLog.id, user.id)
	await auditRequest({
		request,
		action: AuditAction.OTHER,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: emailLog.participantId,
		description: `Resent "${resent.subject}" to ${resent.recipient}`,
		userId: user.id,
		tenantId: event.tenantId,
		metadata: { emailLogId: emailLog.id, trigger: resent.trigger },
	})

	return redirectWithToast(redirectTo, {
		type: 'success',
		title: 'Email resent',
		description: `Sending to ${resent.recipient}. It appears at the top of the log; refresh to see its status.`,
	})
}

const statusStyles: Record<EmailStatus, string> = {
	SENT: 'bg-green-100 text-green-800',
	FAILED: 'bg-red-100 text-red-800',
	PENDING: 'bg-gray-100 text-gray-800',
}

export default function EventEmailLogRoute() {
	const { emails, counts, retryCount, totalPages, currentPage } =
		useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()
	const navigation = useNavigation()
	const resendingId =
		navigation.state !== 'idle' ? navigation.formData?.get('emailLogId') : null
	const isRetrying =
		navigation.state !== 'idle' &&
		navigation.formData?.get('intent') === 'retry-failed'
	const location = useLocation()
	const isFiltered = ['status', 'trigger', 'search'].some(key =>
		searchParams.get(key),
	)

	return (
		<Card>
			<CardHeader className="gap-4 space-y-0">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex flex-col gap-1">
						<CardTitle>Email log</CardTitle>
						<p className="text-sm text-muted-foreground">
							{counts.SENT} sent · {counts.FAILED} failed · {counts.PENDING}{' '}
							pending
						</p>
					</div>
					{retryCount > 0 && (
						<Form method="POST">
							<AuthenticityTokenInput />
							<input type="hidden" name="intent" value="retry-failed" />
							<Button type="submit" size="sm" disabled={isRetrying}>
								<RotateCwIcon className="mr-2 h-4 w-4" />
								{isRetrying
									? 'Retrying...'
									: `Retry ${retryCount} failed`}
							</Button>
						</Form>
					)}
				</div>
				<SearchBar
					status="idle"
					action={location.pathname}
					autoSubmit
					showAddButton={false}
					filters={[
						{
							name: 'status',
							label: 'Status',
							type: 'select',
							options: [
								{ value: 'all', label: 'All statuses' },
								...Object.values(EmailStatus).map(status => ({
									value: status,
									label: status.charAt(0) + status.slice(1).toLowerCase(),
								})),
							],
						},
						{
							name: 'trigger',
							label: 'Email',
							type: 'select',
							options: [
								{ value: 'all', label: 'All emails' },
								...EMAIL_TRIGGERS.map(trigger => ({
									value: trigger,
									label: EMAIL_TEMPLATE_DEFAULTS[trigger].label,
								})),
							],
						},
					]}
				/>
			</CardHeader>
			<CardContent className="p-0">
				{emails.length === 0 ? (
					<p className="px-6 py-10 text-center text-sm text-muted-foreground">
						{isFiltered
							? 'No emails match these filters.'
							: 'No emails have been sent for this event yet.'}
					</p>
				) : (
					<ul className="divide-y border-t">
						{emails.map(email => (
							<li
								key={email.id}
								className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-start sm:justify-between"
							>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-medium">
											{email.participant.firstName}{' '}
											{email.participant.familyName}
										</span>
										<Badge variant="outline">
											{EMAIL_TEMPLATE_DEFAULTS[email.trigger].label}
										</Badge>
										<Badge className={statusStyles[email.status]}>
											{email.status}
										</Badge>
									</div>
									<p className="mt-1 break-all text-sm text-muted-foreground">
										To {email.recipient} ·{' '}
										<span className="tabular-nums">
											{format(new Date(email.createdAt), 'MMM d, yyyy HH:mm')}
										</span>
										{email.triggeredBy
											? ` · by ${email.triggeredBy.username}`
											: ''}
									</p>
									{email.status === 'FAILED' && email.error && (
										<p className="mt-1 break-all text-sm text-destructive">
											{email.error}
										</p>
									)}
									<details className="mt-2 text-sm">
										<summary className="cursor-pointer text-muted-foreground">
											{email.subject}
										</summary>
										<pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3 font-sans">
											{email.body}
										</pre>
									</details>
								</div>
								<div className="flex shrink-0 gap-2">
									<Button asChild variant="ghost" size="sm">
										<Link
											to={`/admin/participants/${email.participant.id}/history`}
										>
											<HistoryIcon className="mr-2 h-4 w-4" />
											History
										</Link>
									</Button>
									<Form method="POST">
										<AuthenticityTokenInput />
										<input type="hidden" name="emailLogId" value={email.id} />
										<Button
											type="submit"
											variant="outline"
											size="sm"
											disabled={resendingId === email.id}
										>
											<RotateCwIcon className="mr-2 h-4 w-4" />
											{resendingId === email.id ? 'Resending...' : 'Resend'}
										</Button>
									</Form>
								</div>
							</li>
						))}
					</ul>
				)}
				{totalPages > 1 && (
					<div className="border-t px-6 py-4">
						<Paginator
							totalPages={totalPages}
							currentPage={currentPage}
							defaultPageSize={DEFAULT_PAGE_SIZE}
							pageSizeOptions={PAGE_SIZE_OPTIONS}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
