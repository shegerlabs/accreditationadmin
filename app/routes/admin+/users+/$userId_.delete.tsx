import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { UserEditor } from './__user-editor'
export { action } from './__user-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { userId } = params

	const user = await prisma.user.findUnique({
		where: { id: userId },
	})

	invariantResponse(user, 'Not Found', { status: 404 })

	const roles = await prisma.role.findMany()

	return json({ user, roles })
}

export default function EditCountryRoute() {
	const { user, roles } = useLoaderData<typeof loader>()
	return (
		<UserEditor user={user} roles={roles} title="Delete User" intent="delete" />
	)
}
