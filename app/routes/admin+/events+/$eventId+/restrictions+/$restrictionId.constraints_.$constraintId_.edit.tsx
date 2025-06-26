import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRole } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { ConstraintEditor } from './__constraint-editor'
export { action } from './__constraint-editor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')

	const { restrictionId, constraintId } = params

	const restriction = await prisma.restriction.findUnique({
		where: { id: restrictionId },
	})

	invariantResponse(restriction, 'Restriction not found', { status: 404 })

	const constraint = await prisma.constraint.findUnique({
		where: { id: constraintId },
	})

	invariantResponse(constraint, 'Not Found', { status: 404 })

	return json({ constraint, restriction })
}

export default function EditConstraintRoute() {
	const { constraint, restriction } = useLoaderData<typeof loader>()
	return (
		<ConstraintEditor
			constraint={constraint}
			restriction={restriction}
			title="Edit Constraint"
		/>
	)
}
