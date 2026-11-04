import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData, useParams } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { BadgeTemplateEditor } from './__badge-template-editor'
export { action } from './__badge-template-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { templateId } = params

	const template = await prisma.badgeTemplate.findUnique({
		where: { id: templateId },
		select: {
			id: true,
			name: true,
			description: true,
			tenantId: true,
			width: true,
			height: true,
			borderWidth: true,
			borderColor: true,
			borderRadius: true,
			badgeIdPrefix: true,
			isDefault: true,
		},
	})

	invariantResponse(template, 'Not Found', { status: 404 })

	return json({ template })
}

export default function EditBadgeTemplateRoute() {
	const { template } = useLoaderData<typeof loader>()
	const { tenantId } = useParams()

	return (
		<BadgeTemplateEditor
			template={template}
			tenantId={tenantId!}
			title="Edit Badge Template"
			description="Update the badge template settings."
			intent="edit"
			cancelUrl={`/admin/tenants/${tenantId}/badge-templates`}
		/>
	)
}
