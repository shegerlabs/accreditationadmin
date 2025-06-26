import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { TenantEditor } from './__tenant-editor'
export { action } from './__tenant-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { tenantId } = params

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
