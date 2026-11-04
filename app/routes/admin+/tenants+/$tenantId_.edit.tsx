import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { TenantEditor } from './__tenant-editor'
export { action } from './__tenant-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)

	const { tenantId } = params

	// Tenant admins can only edit their own tenant
	if (!currentUser.isGlobalAdmin && tenantId !== currentUser.tenantId) {
		throw json({ message: 'You can only edit your own tenant' }, { status: 403 })
	}

	const tenant = await prisma.tenant.findUnique({
		where: { id: tenantId },
	})

	invariantResponse(tenant, 'Not Found', { status: 404 })

	return json({ tenant })
}

export default function EditTenantRoute() {
	const { tenant } = useLoaderData<typeof loader>()

	return <TenantEditor tenant={tenant} title="Update Tenant" />
}
