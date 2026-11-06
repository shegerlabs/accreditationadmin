import { parseWithZod } from '@conform-to/zod'
import type { AccessLevel } from '@prisma/client'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import {
	Outlet,
	useActionData,
	useLoaderData,
	useLocation,
	useParams,
} from '@remix-run/react'
import {
	CheckIcon,
	CopyIcon,
	EditIcon,
	ListIcon,
	LockOpenIcon,
	TrashIcon,
	UserIcon,
} from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { ActionButton } from '~/components/action-form'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Button } from '~/components/ui/button'
import { getPasswordHash, requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { getEventParticipantTypes } from '~/utils/event-participant-types.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'

type RestrictionWithConstraints = {
	id: string
	name: string
	constraints: {
		id: string
		participantTypeId: string
		accessLevel: AccessLevel
		quota: number
	}[]
}

export const GenerateSecretSchema = z.object({
	invitationId: z.string(),
})

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const { data, totalPages, currentPage, defaultPageSize, pageSizeOptions } = await filterAndPaginate({
		request,
		model: prisma.invitation,
		searchFields: ['email', 'organization'],
		filterFields: [],
		where: { eventId },
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			email: true,
			organization: true,
			maximumQuota: true,
		},
	})

	const tenants = await prisma.tenant.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const events = await prisma.event.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const restrictions = await prisma.restriction.findMany({
		where: { eventId },
		select: {
			id: true,
			name: true,
			constraints: {
				select: {
					id: true,
					participantTypeId: true,
					accessLevel: true,
					quota: true,
				},
			},
		},
	})

	const participantTypes = await getEventParticipantTypes(eventId!, {
		includeAny: true,
	})

	const accessLevels: AccessLevel[] = ['OPEN', 'CLOSED']

	return json({
		status: 'idle',
		invitations: data,
		totalPages,
		currentPage,
		defaultPageSize,
		pageSizeOptions,
		tenants,
		events,
		restrictions,
		participantTypes,
		accessLevels,
	} as const)
}

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)

	const submission = parseWithZod(formData, {
		schema: GenerateSecretSchema,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { invitationId } = submission.value

	const invitation = await prisma.invitation.findUnique({
		where: { id: invitationId },
		select: {
			id: true,
			name: true,
			email: true,
			tenantId: true,
		},
	})
	invariantResponse(invitation, 'Invitation not found', { status: 404 })

	const email = invitation.email.toLowerCase()
	const username = email.split('@')[0]

	const generatePassword = () => {
		const chars =
			'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
		return Array.from({ length: 10 }, () =>
			chars.charAt(Math.floor(Math.random() * chars.length)),
		).join('')
	}
	const password = generatePassword()
	const hash = await getPasswordHash(password)

	await prisma.user.upsert({
		where: { email },
		create: {
			email,
			username: username,
			name: invitation.name || email,
			tenantId: invitation.tenantId,
			roles: {
				connect: [{ name: 'focal' }],
			},
			password: {
				create: { hash },
			},
		},
		update: {
			tenantId: invitation.tenantId,
			name: invitation.name || undefined,
			roles: {
				set: [],
				connect: [{ name: 'focal' }],
			},
			password: {
				upsert: {
					create: { hash },
					update: { hash },
				},
			},
		},
	})

	return json({
		success: true,
		message: 'Secret generated successfully',
		secret: password,
		email,
	})
}

type ActionData =
	| { result: any }
	| { success: boolean; message: string; secret: string; email: string }

function SecretDisplay({ secret }: { secret: string }) {
	const [copied, setCopied] = useState(false)
	const [showSecret, setShowSecret] = useState(true)

	const handleCopy = () => {
		navigator.clipboard.writeText(secret)
		setCopied(true)
		setTimeout(() => {
			setCopied(false)
			setShowSecret(false)
		}, 1000)
	}

	if (!showSecret) return null

	return (
		<div className="flex items-center gap-2">
			<code className="rounded bg-muted px-2 py-1 font-mono text-sm">
				{secret}
			</code>
			<Button
				variant="ghost"
				size="sm"
				onClick={handleCopy}
				className={`transition-all ${copied ? 'text-emerald-500' : 'hover:text-emerald-500'}`}
			>
				{copied ? (
					<CheckIcon className="h-4 w-4" />
				) : (
					<CopyIcon className="h-4 w-4" />
				)}
			</Button>
		</div>
	)
}

export default function InvitationsRoute() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>() as ActionData
	const { totalPages, currentPage, defaultPageSize, pageSizeOptions, restrictions, participantTypes, accessLevels } = data
	const { eventId } = useParams()
	const location = useLocation()

	// Check if we're on a route that should render standalone (not with the list)
	const isStandaloneRoute =
		location.pathname.includes('/constraints') ||
		location.pathname.includes('/secrets')

	if (isStandaloneRoute) {
		return <Outlet context={{ restrictions, participantTypes, accessLevels }} />
	}

	const generateAction = (invitation: any) => {
		const isNewSecret =
			actionData &&
			'success' in actionData &&
			'email' in actionData &&
			actionData.success &&
			actionData.email === invitation.email

		return (
			<div className="flex items-center gap-4">
				<ActionButton
					method="POST"
					data={{
						invitationId: invitation.id,
					}}
					buttonContent={<LockOpenIcon className="h-4 w-4" />}
					buttonVariant="outline"
					buttonSize="sm"
					intent="generate"
					confirmation={{
						title: 'Generate Secret',
						description: `Are you sure you want to generate a new secret for ${invitation.email}? This will overwrite any existing secret.`,
						confirmLabel: 'Generate',
						cancelLabel: 'Cancel',
					}}
				/>
				{isNewSecret && actionData && 'secret' in actionData && (
					<SecretDisplay secret={actionData.secret} />
				)}
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action={`/admin/events/${eventId}/invitations`}
						autoSubmit={false}
						filters={[]}
						extras={[
							{
								type: 'dropdown',
								label: 'More',
								items: [
									{ label: 'Apply Restriction', to: 'apply', icon: 'package' },
									{ label: 'Remove Restriction', to: 'remove', icon: 'cross-1' },
									{ label: 'Secrets', to: 'secrets', icon: 'lock-closed' },
								],
							},
						]}
					/>
				</div>
				<DataList
					data={data.invitations}
					actionWidth="w-96"
					columns={[
						{
							key: 'email',
							header: 'Email',
							render: (invitation: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{invitation.email}</span>
								</div>
							),
						},
						{
							key: 'organization',
							header: 'Organization',
							render: (invitation: any) => invitation.organization,
						},
						{
							key: 'maximumQuota',
							header: 'Max Quota',
							render: (invitation: any) =>
								invitation.maximumQuota && invitation.maximumQuota > 0
									? invitation.maximumQuota
									: 'Unlimited',
						},
					]}
					actions={[
						{
							label: 'Constraints',
							icon: <ListIcon className="h-4 w-4" />,
							href: (invitation: any) =>
								`/admin/events/${eventId}/invitations/${invitation.id}/constraints`,
							variant: 'outline' as const,
						},
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (invitation: any) =>
								`/admin/events/${eventId}/invitations/${invitation.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (invitation: any) =>
								`/admin/events/${eventId}/invitations/${invitation.id}/delete`,
							variant: 'outline' as const,
						},
						{
							label: 'Generate',
							icon: <LockOpenIcon className="h-4 w-4" />,
							variant: 'outline' as const,
							render: (invitation: any) => generateAction(invitation),
						},
					]}
					status={data.status}
					
					keyExtractor={invitation => invitation.id}
					totalPages={totalPages}
					currentPage={currentPage}
					defaultPageSize={defaultPageSize}
					pageSizeOptions={pageSizeOptions}
				/>
			</div>

			{/* Outlet for modal routes (new, edit, delete) */}
			<Outlet context={{ restrictions, participantTypes, accessLevels }} />
		</div>
	)
}
