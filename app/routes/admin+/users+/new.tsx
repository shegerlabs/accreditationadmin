import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { UserEditor } from './__user-editor'
export { action } from './__user-editor.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)

	// Global admins can assign admin, tenant, user roles
	// Tenant admins can assign user, focal, validator, printer, dispatcher roles
	const roles = currentUser.isGlobalAdmin
		? await prisma.role.findMany({
				where: { scope: { in: ['GLOBAL', 'TENANT'] } },
				orderBy: { name: 'asc' },
			})
		: await prisma.role.findMany({
				where: { name: { in: ['user', 'focal', 'validator', 'printer', 'dispatcher', 'checkpoint'] } },
				orderBy: { name: 'asc' },
			})

	// Global admins can assign users to any tenant
	// Tenant admins need their tenant info for the auto-assign display
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

	return json({
		roles,
		tenants,
		isGlobalAdmin: currentUser.isGlobalAdmin,
		currentUserTenantId: currentUser.tenantId,
	})
}
export default function AddUserRoute() {
	const { roles, tenants, isGlobalAdmin, currentUserTenantId } =
		useLoaderData<typeof loader>()
	return (
		<UserEditor
			title="Add User"
			roles={roles}
			tenants={tenants}
			isGlobalAdmin={isGlobalAdmin}
			currentUserTenantId={currentUserTenantId}
			intent="add"
		/>
	)
}
