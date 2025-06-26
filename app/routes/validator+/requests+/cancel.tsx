import { LoaderFunctionArgs } from '@remix-run/node'
import { participantWizard } from '~/utils/registration.server'
import { redirectWithToast } from '~/utils/toast.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const { destroy } = await participantWizard.register(request)

	const headers = await destroy()
	return redirectWithToast(
		'/validator/requests',
		{
			type: 'success',
			title: `Cancelled`,
			description: `Registration cancelled.`,
		},
		{ headers },
	)
}

export default function CancelRoute() {
	return null
}
