import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { parseWithZod } from 'node_modules/@conform-to/zod/parse'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { registrationWizard } from '~/utils/registration.server'
import { redirectWithToast } from '~/utils/toast.server'
import {
	GeneralInfoEditor,
	GeneralInfoEditorSchema,
} from './__general-info-editor'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, [
		'focal',
		'admin',
		'reviewer',
		'first-validator',
		'second-validator',
		'printer',
	])

	const { data } = await registrationWizard.register(request)

	const participant = data?.participant?.id
		? await prisma.participant.findUnique({
				where: { id: data?.participant?.id },
				select: {
					id: true,
					documents: true,
				},
			})
		: null

	return json({
		data,
		photo: participant?.documents.find(doc => doc.documentType === 'PHOTO'),
	})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRoles(request, [
		'focal',
		'admin',
		'reviewer',
		'first-validator',
		'second-validator',
		'printer',
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

	if (intent === 'general') {
		const submission = await parseWithZod(formData, {
			schema: GeneralInfoEditorSchema,
			async: true,
		})
		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const { id, ...data } = submission.value
		void save('general', data)
		return nextStep()
	}
}

export default function AddGeneralInfoRoute() {
	const { data, photo } = useLoaderData<typeof loader>()
	return (
		<GeneralInfoEditor intent="add" participant={data?.general} photo={photo} />
	)
}
