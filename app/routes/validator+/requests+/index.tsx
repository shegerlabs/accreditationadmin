import { Country } from '@prisma/client'
import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useOutletContext } from '@remix-run/react'
import { EyeIcon, UserIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Badge } from '~/components/ui/badge'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { validatorWizard } from '~/utils/registration.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, [
		'first-validator',
		'second-validator',
		'printer',
	])
	const { destroy } = await validatorWizard.register(request)

	const userRoles = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		include: {
			roles: true,
		},
	})

	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.participant,
		searchFields: [
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
		filterFields: ['participantTypeId', 'status', 'countryId'],
		orderBy: [{ createdAt: 'desc' }],
		where: {
			step: {
				roleId: {
					in: userRoles.roles.map(role => role.id),
				},
			},
		},
		select: {
			id: true,
			email: true,
			firstName: true,
			familyName: true,
			organization: true,
			registrationCode: true,
			status: true,
			step: {
				select: {
					name: true,
					action: true,
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

	const participantTypes = await prisma.participantType.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const headers = await destroy()

	return json(
		{
			status: 'idle',
			participants: data,
			totalPages,
			currentPage,
			tenants,
			events,
			participantTypes,
		} as const,
		{ headers },
	)
}

export default function IndexRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, participantTypes } = data
	const isMobile = useMediaQuery({ maxWidth: 767 })
	const { countries } = useOutletContext<{
		countries: Country[]
	}>()

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/validator/requests"
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
								name: 'status',
								label: 'Status',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'INPROGRESS', label: 'In Progress' },
									{ value: 'APPROVED', label: 'Approved' },
									{ value: 'REJECTED', label: 'Rejected' },
									{ value: 'PRINTED', label: 'Printed' },
								],
							},
							{
								name: 'countryId',
								label: 'Country',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...countries.map(country => ({
										value: country.id,
										label: country.name,
									})),
								],
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
							key: 'email',
							header: 'Email',
							render: (participant: any) => participant.email,
						},
						{
							key: 'organization',
							header: 'Organization',
							render: (participant: any) => participant.organization,
						},
						{
							key: 'country',
							header: 'Country',
							render: (participant: any) => participant.country.name,
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
									APPROVED: 'bg-blue-100 text-blue-800 hover:bg-blue-100/80',
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
					]}
					actions={[
						{
							label: 'Documents',
							icon: <EyeIcon className="h-4 w-4" />,
							href: (participant: any) =>
								`/validator/requests/${participant.id}`,
							variant: 'outline' as const,
						},
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={participant => participant.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
