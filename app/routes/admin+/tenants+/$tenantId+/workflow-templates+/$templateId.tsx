import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { templateId } = params

	const template = await prisma.workflowTemplate.findUnique({
		where: { id: templateId },
		select: {
			id: true,
			name: true,
			description: true,
			tenantId: true,
		},
	})

	invariantResponse(template, 'Not Found', { status: 404 })

	const roles = await prisma.role.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})

	return json({ template, roles })
}

export default function WorkflowTemplateDetailRoute() {
	const { template, roles } = useLoaderData<typeof loader>()

	return <Outlet context={{ template, roles }} />
}
