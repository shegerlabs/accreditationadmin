import { LoaderFunctionArgs } from '@remix-run/node'
import { registrationWizard } from '~/utils/registration.server'
import { redirectWithToast } from '~/utils/toast.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const { destroy } = await registrationWizard.register(request)

	const headers = await destroy()
	return redirectWithToast(
		'/admin/participants',
		{
			type: 'success',
			title: `Cancelled`,
			description: `Participant registration cancelled.`,
		},
		{ headers },
	)
}

export default function CancelRoute() {
	return null
}
