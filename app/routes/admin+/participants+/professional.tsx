import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { parseWithZod } from 'node_modules/@conform-to/zod/parse'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { registrationWizard } from '~/utils/registration.server'
import { redirectWithToast } from '~/utils/toast.server'
import {
	ProfessionalInfoEditor,
	ProfessionalInfoEditorSchema,
} from './__professional-info-editor'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, [
		'focal',
		'admin',
		'reviewer',
		'mofa-validator',
		'niss-validator',
		'mofa-printer',
		'first-validator',
		'second-validator',
		'printer',
	])
	const { data } = await registrationWizard.register(request)
	return json({ data })
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRoles(request, [
		'focal',
		'admin',
		'reviewer',
		'mofa-validator',
		'niss-validator',
		'mofa-printer',
	])
	const { save, nextStep, prevStep, destroy } =
		await registrationWizard.register(request)
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'cancel') {
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

	if (intent === 'prev') {
		return prevStep()
	}

	if (intent === 'professional') {
		const submission = await parseWithZod(formData, {
			schema: ProfessionalInfoEditorSchema,
			async: true,
		})
		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const { id, ...data } = submission.value
		void save('professional', data)
		return nextStep()
	}
}

export default function AddProfessionalInfoRoute() {
	const { data } = useLoaderData<typeof loader>()
	return (
		<ProfessionalInfoEditor intent="add" participant={data?.professional} />
	)
}
