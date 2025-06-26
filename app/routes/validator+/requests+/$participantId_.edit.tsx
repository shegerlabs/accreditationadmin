import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { parseWithZod } from 'node_modules/@conform-to/zod/parse'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { WishlistEditor, WishlistEditorSchema } from './__wishlist-editor'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, [
		'mofa-validator',
		'niss-validator',
		'mofa-printer',
		'et-broadcast',
		'first-validator',
		'second-validator',
		'printer',
	])

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
			participantTypeId: true,
			wishList: true,
			attendClosedSession: true,
		},
	})

	invariantResponse(participant, 'Not Found', { status: 404 })

	const participantTypes = await prisma.participantType.findMany({
		select: { id: true, name: true },
	})

	return json({
		participant: {
			id: participant.id,
			participantTypeId: participant.participantTypeId,
			meetings: participant.wishList?.split(','),
			attendClosedSession: participant.attendClosedSession,
		},
		participantTypes,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, [
		'mofa-validator',
		'niss-validator',
		'mofa-printer',
		'et-broadcast',
		'first-validator',
		'second-validator',
		'printer',
	])
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

	const userRoles = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		include: {
			roles: true,
		},
	})

	const { id: participantId } = submission.value

	const wishlist = {
		wishList: submission.value.meetings?.join(','),
		attendClosedSession: submission.value.attendClosedSession === 'true',
		participantTypeId: submission.value.participantTypeId,
	}

	await prisma.participant.update({
		where: {
			id: participantId,
			step: { roleId: { in: userRoles.roles.map(role => role.id) } },
		},
		data: wishlist,
	})

	await auditRequest({
		request,
		action: AuditAction.UPDATE,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participantId,
		description: 'Participant wishlist updated',
		userId: user.id,
	})

	return redirectWithToast(`/validator/requests/${participantId}`, {
		type: 'success',
		title: `Participant Wishlist Updated`,
		description: `Participant wishlist updated successfully.`,
	})
}

export default function WishlistEditorRoute() {
	const { participant, participantTypes } = useLoaderData<typeof loader>()
	return (
		<WishlistEditor
			participant={{
				id: participant.id,
				participantTypeId: participant.participantTypeId,
				meetings: participant.meetings ?? [],
				attendClosedSession: participant.attendClosedSession,
			}}
			participantTypes={participantTypes}
		/>
	)
}
