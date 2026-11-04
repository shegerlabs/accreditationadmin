import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { UserEditor } from './__user-editor'
export { action } from './__user-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)

	const { userId } = params

	// Global admins can access any user
	// Tenant admins can access their own tenant's users OR orphan users (tenantId = null)
	const user = await prisma.user.findFirst({
		where: currentUser.isGlobalAdmin
			? { id: userId }
			: {
					id: userId,
					OR: [
						{ tenantId: currentUser.tenantId },
						{ tenantId: null },
					],
				},
		include: {
			roles: true,
			tenant: { select: { id: true, name: true } },
		},
	})

	invariantResponse(user, 'Not Found', { status: 404 })

	return json({ user })
}

export default function DeleteUserRoute() {
	const { user } = useLoaderData<typeof loader>()
	return (
		<UserEditor
			user={user}
			roles={[]}
			title="Delete User"
			intent="delete"
			returnTo={`/admin/users/${user.id}`}
		/>
	)
}
