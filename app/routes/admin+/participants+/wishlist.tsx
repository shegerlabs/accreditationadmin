import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { parseWithZod } from 'node_modules/@conform-to/zod/parse'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { WishlistEditor, WishlistEditorSchema } from './__wishlist-editor'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		select: {
			id: true,
			wishList: true,
			participantTypeId: true,
		},
	})

	invariantResponse(participant, 'Not Found', { status: 404 })

	const participantTypes = await prisma.participantType.findMany()

	return json({
		participant: {
			id: participant.id,
			participantTypeId: participant.participantTypeId,
			meetings: participant.wishList?.split(','),
		},
		participantTypes,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: WishlistEditorSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { id: participantId } = submission.value

	const wishlist = {
		wishList: submission.value.meetings?.join(','),
	}

	await prisma.participant.update({
		where: { id: participantId },
		data: wishlist,
	})

	return redirectWithToast('/admin/participants', {
		type: 'success',
		title: `Participant Wishlist Updated`,
		description: `Participant wishlist updated successfully.`,
	})
}

export default function AddProfessionalInfoRoute() {
	const { participant, participantTypes } = useLoaderData<typeof loader>()
	return (
		<WishlistEditor
			participant={{
				id: participant.id,
				participantTypeId: participant.participantTypeId,
				meetings: participant.meetings ?? [],
			}}
			participantTypes={participantTypes}
		/>
	)
}
