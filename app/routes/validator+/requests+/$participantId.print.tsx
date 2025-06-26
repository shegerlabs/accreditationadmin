import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useLoaderData,
	useParams,
} from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

import { Action } from '@prisma/client'
import { InputField } from '~/components/conform/InputField'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Separator } from '~/components/ui/separator'
import { requireUserWithRoles } from '~/utils/auth.server'
import { processParticipant } from '~/utils/workflow.server'

export const ParticipantPrintSchema = z.object({
	id: z.string().optional(),
})

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: ParticipantPrintSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const userRoles = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		include: {
			roles: true,
		},
	})

	const { id: participantId } = submission.value

	const participant = await prisma.participant.findFirst({
		where: {
			id: participantId,
			step: { roleId: { in: userRoles.roles.map(role => role.id) } },
		},
		select: { id: true },
	})

	invariantResponse(participant, 'Participant not found', {
		status: 404,
	})

	const remarks = `Badge Printed`
	await processParticipant(participant.id, user.id, Action.PRINT, remarks)

	return redirectWithToast(`/validator/requests/${participantId}/badge`, {
		type: 'success',
		title: 'Participant Printed',
		description: `Participant printed.`,
	})
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	const userRoles = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		include: {
			roles: true,
		},
	})

	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: {
			id: participantId,
			step: { roleId: { in: userRoles.roles.map(role => role.id) } },
		},
		select: {
			id: true,
		},
	})

	invariantResponse(participant, 'Participant not found', { status: 404 })

	return json({ participant })
}

export default function AssessmentEditor() {
	const { participant } = useLoaderData<typeof loader>()

	const params = useParams()
	const actionData = useActionData<typeof action>()
	const schema = ParticipantPrintSchema
	const [form, fields] = useForm({
		id: 'participant-print-form',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			id: participant.id,
		},
	})

	return (
		<Card className="rounded-sm bg-white shadow-sm xl:col-span-2">
			<CardHeader className="flex flex-row items-center rounded-t-lg bg-gray-100 px-6 py-2">
				<div className="grid gap-1">
					<CardTitle className="text-base font-semibold leading-6 text-gray-900">
						Print Badge
					</CardTitle>
				</div>
			</CardHeader>
			<Separator className="mb-2" />
			<CardContent className="grid gap-8 p-4">
				<Form className="grid gap-4" method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<InputField meta={fields.id} type="hidden" />

					<div className="flex w-full gap-2">
						<Button type="submit" className="flex-grow" variant="destructive">
							Print
						</Button>

						<Button asChild variant="outline" className="flex-grow">
							<Link to={`/validator/requests/${params.participantId}`}>
								Cancel
							</Link>
						</Button>
					</div>
				</Form>
			</CardContent>
		</Card>
	)
}
