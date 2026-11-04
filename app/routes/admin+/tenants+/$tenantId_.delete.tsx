import { LoaderFunctionArgs } from '@remix-run/node'
import { json, useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { TenantEditor } from './__tenant-editor'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
export { action } from './__tenant-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	// Only global admins can delete tenants
	await requireUserWithRoles(request, ['admin'])

	const { tenantId } = params

	const tenant = await prisma.tenant.findUnique({
		where: { id: tenantId },
	})

	invariantResponse(tenant, 'Not Found', { status: 404 })

	return json({ tenant })
}

export default function DeleteTenantRoute() {
	const { tenant } = useLoaderData<typeof loader>()
	return <TenantEditor tenant={tenant} title="Delete Tenant" intent="delete" />
}
