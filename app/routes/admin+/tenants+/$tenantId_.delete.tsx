import { LoaderFunctionArgs, redirect } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { TenantEditor } from './__tenant-editor'
export { action } from './__tenant-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	// const { tenantId } = params

	// const tenant = await prisma.tenant.findUnique({
	// 	where: { id: tenantId },
	// })

	// invariantResponse(tenant, 'Not Found', { status: 404 })

	// return json({ tenant })
	throw redirect('/admin/events')
}

export default function DeleteTenantRoute() {
	const { tenant } = useLoaderData<typeof loader>()
	return <TenantEditor tenant={tenant} title="Delete Tenant" intent="delete" />
}
