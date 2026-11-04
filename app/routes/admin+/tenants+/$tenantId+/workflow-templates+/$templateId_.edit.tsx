import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData, useParams } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { TemplateEditor } from './__template-editor'
export { action } from './__template-editor.server'

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

	return json({ template })
}

export default function EditWorkflowTemplateRoute() {
	const { template } = useLoaderData<typeof loader>()
	const { tenantId } = useParams()

	return (
		<TemplateEditor
			template={template}
			tenantId={tenantId!}
			title="Edit Workflow Template"
			description="Update the workflow template details."
			intent="edit"
			cancelUrl={`/admin/tenants/${tenantId}/workflow-templates`}
		/>
	)
}
