import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { StepEditor } from './__step-editor'
export { action } from './__step-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { workflowId } = params

	const workflow = await prisma.workflow.findUnique({
		select: {
			id: true,
			tenantId: true,
			eventId: true,
		},
		where: { id: workflowId },
	})

	invariantResponse(workflow, 'Not Found', { status: 404 })

	return json({ workflow })
}

export default function AddStepRoute() {
	const { workflow } = useLoaderData<typeof loader>()
	return <StepEditor title="Add Step" workflow={workflow} />
}
