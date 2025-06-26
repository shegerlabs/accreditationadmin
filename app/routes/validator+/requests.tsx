import { LoaderFunctionArgs } from '@remix-run/node'
import { json, Outlet, useLoaderData } from '@remix-run/react'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import Steps from '~/components/steps'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { validatorWizard } from '~/utils/registration.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, [
		'mofa-validator',
		'mofa-printer',
		'niss-validator',
		'et-broadcast',
		'first-validator',
		'second-validator',
		'printer',
	])

	const { hasData, currentStep, routes } =
		await validatorWizard.register(request)
	const showSteps = currentStep !== null && hasData()
	let stepsWithStatus: Array<{
		id: string
		name: string
		href: string
		status: 'complete' | 'current' | 'upcoming'
	}> = []
	if (showSteps) {
		const stepsDefinition = [
			{ id: '01', name: 'General', href: routes[0] },
			{ id: '02', name: 'Professional', href: routes[1] },
			{ id: '03', name: 'Wishlist', href: routes[2] },
			{ id: '04', name: 'Documents', href: routes[3] },
		]

		stepsWithStatus = stepsDefinition.map((step, index) => {
			let status: 'complete' | 'current' | 'upcoming' = 'upcoming'
			if (index < currentStep) status = 'complete'
			else if (index === currentStep) status = 'current'
			return { ...step, status }
		})
	}

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

	return json({
		tenants,
		events,
		participantTypes,
		meetingTypes,
		countries,
		showSteps,
		steps: stepsWithStatus,
	})
}

export default function RequestsRoute() {
	const {
		tenants,
		events,
		participantTypes,
		meetingTypes,
		countries,
		showSteps,
		steps,
	} = useLoaderData<typeof loader>()

	return (
		<div className="flex flex-col gap-4">
			{showSteps && <Steps steps={steps} />}
			<Outlet
				context={{
					tenants,
					events,
					participantTypes,
					meetingTypes,
					countries,
				}}
			/>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You don't have permission to view accreditation requests."
						redirectUrl="/requests"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
