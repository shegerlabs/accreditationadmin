import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { useFetcher, useLoaderData } from '@remix-run/react'
import { EyeIcon, TrashIcon, UserIcon } from 'lucide-react'
import { useState } from 'react'
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Badge } from '~/components/ui/badge'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { registrationWizard } from '~/utils/registration.server'
import { useOptionalUser } from '~/utils/user'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const { destroy } = await registrationWizard.register(request)

	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.participant,
		searchFields: [
			'id',
			'email',
			'organization',
			'registrationCode',
			'firstName',
			'familyName',
			{ tenant: 'name' },
			{ event: 'name' },
			{ participantType: 'name' },
			{ country: 'name' },
		],
		filterFields: [
			'participantTypeId',
			'status',
			'nationalityId',
			'organization',
			{ field: 'wishList', operator: 'array-contains' },
		],
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			email: true,
			firstName: true,
			familyName: true,
			organization: true,
			registrationCode: true,
			status: true,
			wishList: true,
			step: {
				select: {
					name: true,
					action: true,
					role: {
						select: {
							name: true,
						},
					},
				},
			},
			tenant: {
				select: {
					name: true,
				},
			},
			event: {
				select: {
					name: true,
				},
			},
			participantType: {
				select: {
					name: true,
				},
			},
			country: {
				select: {
					name: true,
				},
			},
		},
	})

	const participantTypes = await prisma.participantType.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const meetingTypes = await prisma.meetingType.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const countries = await prisma.country.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const invitations = await prisma.invitation.findMany({
		select: {
			organization: true,
		},
		distinct: ['organization'],
	})

	const headers = await destroy()

	return json(
		{
			status: 'idle',
			participants: data,
			totalPages,
			currentPage,
			participantTypes,
			countries,
			meetingTypes,
			invitations,
		} as const,
		{ headers },
	)
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'bulk-delete') {
		const selectedIds = formData.get('selectedIds')?.toString().split(',') || []

		if (selectedIds.length > 0) {
			await prisma.participant.deleteMany({
				where: {
					id: {
						in: selectedIds,
					},
				},
			})
		}

		return json({
			status: 'success',
			message: 'Participants deleted successfully',
		})
	}

	return json({ status: 'error', message: 'Invalid action' }, { status: 400 })
}

export default function IndexRoute() {
	const data = useLoaderData<typeof loader>()
	const {
		totalPages,
		currentPage,
		participantTypes,
		countries,
		meetingTypes,
		invitations,
	} = data
	const user = useOptionalUser()
	const isMobile = useMediaQuery({ maxWidth: 767 })
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
	const fetcher = useFetcher()

	const handleBulkDelete = async (selectedIds: Set<string>) => {
		if (
			window.confirm(
				`Are you sure you want to delete ${selectedIds.size} participants?`,
			)
		) {
			const formData = new FormData()
			formData.append('intent', 'bulk-delete')
			formData.append('selectedIds', Array.from(selectedIds).join(','))

			fetcher.submit(formData, {
				method: 'POST',
			})

			// Clear selection after delete
			setSelectedIds(new Set())
		}
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/admin/participants"
						autoSubmit={true}
						showAddButton={false}
						filters={[
							{
								name: 'participantTypeId',
								label: 'Participant Type',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...participantTypes
										.filter(participantType => participantType.name !== 'All')
										.map(participantType => ({
											value: participantType.id,
											label: participantType.name,
										})),
								],
							},
							{
								name: 'wishList',
								label: 'Wish List',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...meetingTypes.map(meetingType => ({
										value: meetingType.id,
										label: meetingType.name,
									})),
								],
							},
							{
								name: 'nationalityId',
								label: 'Nationality',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...countries.map(country => ({
										value: country.id,
										label: country.name,
									})),
								],
							},
							{
								name: 'status',
								label: 'Status',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'INPROGRESS', label: 'In Progress' },
									{ value: 'REJECTED', label: 'Rejected' },
									{ value: 'PRINTED', label: 'Printed' },
									{ value: 'BYPASSED', label: 'Bypassed' },
								],
							},
							{
								name: 'organization',
								label: 'Invitation',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...invitations.map(invitation => ({
										value: invitation.organization,
										label: invitation.organization,
									})),
								],
							},
						]}
						extras={[
							{
								label: 'Export',
								to: '/admin/resources/participants',
								icon: 'download',
								type: 'anchor',
							},
						]}
					/>
				</div>

				<DataList
					data={data.participants}
					columns={[
						{
							key: 'registrationCode',
							header: 'Code',
							render: (participant: any) => participant.registrationCode,
						},
						{
							key: 'name',
							header: 'Name',
							render: (participant: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>
										{participant.firstName} {participant.familyName}
									</span>
								</div>
							),
						},
						{
							key: 'organization',
							header: 'Organization',
							render: (participant: any) => participant.organization,
						},
						{
							key: 'participantType',
							header: 'Participant Type',
							render: (participant: any) => participant.participantType.name,
						},
						{
							key: 'status',
							header: 'Status',
							render: (participant: any) => {
								const statusStyles = {
									INPROGRESS:
										'bg-orange-100 text-orange-800 hover:bg-orange-100/80',
									REJECTED: 'bg-red-100 text-red-800 hover:bg-red-100/80',
									PRINTED: 'bg-green-100 text-green-800 hover:bg-green-100/80',
								}
								return (
									<Badge
										className={
											statusStyles[
												participant.status as keyof typeof statusStyles
											] ?? ''
										}
									>
										{participant.status}
									</Badge>
								)
							},
						},
						{
							key: 'step',
							header: 'Current Step',
							render: (participant: any) => (
								<div className="flex items-center">
									<span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-700/10">
										{participant.step?.role?.name === 'reviewer'
											? 'focal person'
											: participant.step?.role?.name}
									</span>
								</div>
							),
						},
					]}
					actions={[
						{
							label: 'Documents',
							icon: <EyeIcon className="h-4 w-4" />,
							href: (participant: any) =>
								`/admin/participants/${participant.id}`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							href: (participant: any) =>
								`/admin/participants/${participant.id}/delete`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={participant => participant.id}
					totalPages={totalPages}
					currentPage={currentPage}
					selectable={true}
					selectedIds={selectedIds}
					onSelectionChange={setSelectedIds}
					bulkActions={[
						{
							label: 'Delete Selected',
							icon: <TrashIcon className="h-4 w-4" />,
							variant: 'destructive',
							onClick: handleBulkDelete,
						},
					]}
				/>
			</div>
		</div>
	)
}
