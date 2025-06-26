import { parseWithZod } from '@conform-to/zod'
import { ParticipantType, Restriction } from '@prisma/client'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import {
	useActionData,
	useLoaderData,
	useOutletContext,
	useParams,
} from '@remix-run/react'
import {
	CheckIcon,
	CopyIcon,
	EditIcon,
	LockOpenIcon,
	TrashIcon,
	UserIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useMediaQuery } from 'react-responsive'
import { z } from 'zod'
import { ActionButton } from '~/components/action-form'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Button } from '~/components/ui/button'
import { getPasswordHash, requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

export const GenerateSecretSchema = z.object({
	invitationId: z.string(),
})

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { eventId } = params
	const url = new URL(request.url)
	url.searchParams.set('pageSize', 'All')
	const modifiedRequest = new Request(url, request)

	const { data, totalPages, currentPage } = await filterAndPaginate({
		request: modifiedRequest,
		model: prisma.invitation,
		searchFields: [
			'email',
			'organization',
			{ restriction: 'name' },
			{ participantType: 'name' },
		],
		filterFields: ['restrictionId', 'participantTypeId'],
		where: { eventId },
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			email: true,
			organization: true,
			maximumQuota: true,
			restriction: {
				select: {
					name: true,
				},
			},
			participantType: {
				select: {
					name: true,
				},
			},
		},
	})

	return json({
		status: 'idle',
		invitations: data,
		totalPages,
		currentPage,
	} as const)
}

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const { eventId } = params
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

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
			email: true,
		},
	})
	invariantResponse(invitation, 'Invitation not found', { status: 404 })

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
		where: { email: invitation.email },
		create: {
			email: invitation.email,
			username: invitation.email,
			name: invitation.email,
			roles: {
				connect: [{ name: 'focal' }],
			},
			password: {
				create: { hash },
			},
		},
		update: {
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
		email: invitation.email,
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

export default function IndexRoute() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>() as ActionData
	const { totalPages, currentPage } = data

	const { restrictions, participantTypes } = useOutletContext<{
		restrictions: Restriction[]
		participantTypes: ParticipantType[]
	}>()

	const isMobile = useMediaQuery({ maxWidth: 767 })
	const { eventId } = useParams()

	const generateAction = (invitation: any) => {
		const isNewSecret =
			actionData &&
			'success' in actionData &&
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
						filters={[
							{
								name: 'restrictionId',
								label: 'Restriction',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...restrictions.map(restriction => ({
										value: restriction.id,
										label: restriction.name,
									})),
								],
							},
							{
								name: 'participantTypeId',
								label: 'Participant Type',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...participantTypes.map(participantType => ({
										value: participantType.id,
										label: participantType.name,
									})),
								],
							},
						]}
						extras={[
							{
								label: 'Secrets',
								to: 'secrets',
								icon: 'lock-closed',
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
							key: 'participantType',
							header: 'Participant Type',
							render: (invitation: any) => invitation.participantType.name,
						},
						{
							key: 'restriction',
							header: 'Restriction',
							render: (invitation: any) =>
								invitation.restriction?.name ?? 'None',
						},
						{
							key: 'maximumQuota',
							header: 'Quota',
							render: (invitation: any) =>
								invitation.maximumQuota && invitation.maximumQuota > 0
									? invitation.maximumQuota
									: 'Unlimited',
						},
					]}
					actions={[
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (invitation: any) => `${invitation.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (invitation: any) => `${invitation.id}/delete`,
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
					isMobile={isMobile}
					keyExtractor={invitation => invitation.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
