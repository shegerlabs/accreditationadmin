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

	// Global admins can assign admin, tenant, user roles
	// Tenant admins can assign user, focal, validator, printer, dispatcher roles
	const roles = await prisma.role.findMany({
		where: currentUser.isGlobalAdmin
			? { scope: { in: ['GLOBAL', 'TENANT'] } }
			: { name: { in: ['user', 'focal', 'validator', 'printer', 'dispatcher', 'checkpoint'] } },
		orderBy: { name: 'asc' },
	})

	// Global admins can assign users to any tenant
	// Tenant admins can only assign orphan users to their own tenant
	const tenants = currentUser.isGlobalAdmin
		? await prisma.tenant.findMany({
				select: { id: true, name: true },
				orderBy: { name: 'asc' },
			})
		: currentUser.tenantId
			? await prisma.tenant.findMany({
					where: { id: currentUser.tenantId },
					select: { id: true, name: true },
				})
			: []

	// Check if the user being edited is an orphan (for tenant admin UX)
	const isOrphanUser = user.tenantId === null

	return json({
		user,
		roles,
		tenants,
		isGlobalAdmin: currentUser.isGlobalAdmin,
		isOrphanUser,
		currentUserTenantId: currentUser.tenantId,
	})
}

export default function EditUserRoute() {
	const { user, roles, tenants, isGlobalAdmin, isOrphanUser, currentUserTenantId } =
		useLoaderData<typeof loader>()

	return (
		<UserEditor
			user={user}
			roles={roles}
			tenants={tenants}
			isGlobalAdmin={isGlobalAdmin}
			isOrphanUser={isOrphanUser}
			currentUserTenantId={currentUserTenantId}
			title="Edit User"
			intent="edit"
			returnTo={`/admin/users/${user.id}`}
		/>
	)
}
