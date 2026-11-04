import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Outlet, useLoaderData, useOutletContext } from '@remix-run/react'
import type { SerializeFrom } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { WorkflowCanvas } from '~/components/workflow-builder/workflow-canvas'
import { WorkflowData } from '~/components/workflow-builder/types'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { workflowId } = params

	// Fetch all steps (unpaginated) for the visual builder
	const steps = await prisma.step.findMany({
		where: { workflowId },
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

	const roles = await prisma.role.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})

	// Get all steps for the "next step" dropdown (include action to filter REJECT/BYPASS)
	const allSteps = await prisma.step.findMany({
		where: { workflowId },
		select: { id: true, name: true, action: true },
		orderBy: { order: 'asc' },
	})

	return json({ steps, roles, allSteps })
}

export default function VisualStepsLayout() {
	const { steps, roles, allSteps } = useLoaderData<typeof loader>()
	const { workflow } = useOutletContext<{ workflow: SerializeFrom<WorkflowData> }>()

	return (
		<div className="w-full">
			<WorkflowCanvas steps={steps} workflow={workflow} />
			{/* Outlet for sheet routes (new, edit) */}
			<Outlet context={{ workflow, roles, steps: allSteps }} />
		</div>
	)
}
