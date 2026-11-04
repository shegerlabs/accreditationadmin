import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData, useOutletContext } from '@remix-run/react'
import type { SerializeFrom } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { WorkflowCanvas } from '~/components/workflow-builder/workflow-canvas'
import { WorkflowData } from '~/components/workflow-builder/types'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { templateId } = params

	// Fetch all steps for the visual builder
	const steps = await prisma.stepTemplate.findMany({
		where: { workflowTemplateId: templateId },
		select: {
			id: true,
			name: true,
			action: true,
			order: true,
			roleId: true,
			nextStepId: true,
			isRejectionTarget: true,
			isBypassTarget: true,
			requiresAssignment: true,
			slaDurationMinutes: true,
			positionX: true,
			positionY: true,
			role: {
				select: {
					id: true,
					name: true,
				},
			},
		},
		orderBy: { order: 'asc' },
	})

	// Get all steps for the "next step" dropdown
	const allSteps = await prisma.stepTemplate.findMany({
		where: { workflowTemplateId: templateId },
		select: { id: true, name: true, action: true },
		orderBy: { order: 'asc' },
	})

	return json({ steps, allSteps })
}

export default function VisualStepsLayout() {
	const { steps, allSteps } = useLoaderData<typeof loader>()
	const { template, roles } = useOutletContext<{
		template: SerializeFrom<WorkflowData>
		roles: Array<{ id: string; name: string }>
	}>()

	return (
		<div className="w-full">
			<WorkflowCanvas steps={steps} workflow={template} />
			{/* Outlet for sheet routes (new, edit) */}
			<Outlet context={{ template, roles, steps: allSteps }} />
		</div>
	)
}
