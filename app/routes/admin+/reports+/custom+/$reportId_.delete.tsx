import {
	json,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, Link, useLoaderData, useNavigation } from '@remix-run/react'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)
	const { reportId } = params

	if (!reportId) {
		throw new Response('Report ID required', { status: 400 })
	}

	const report = await prisma.customReport.findFirst({
		where: {
			id: reportId,
			...tenantFilter,
			createdById: user.id, // Only owner can delete
		},
		select: {
			id: true,
			name: true,
			description: true,
		},
	})

	if (!report) {
		throw new Response('Report not found or access denied', { status: 404 })
	}

	return json({ report })
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)
	const { reportId } = params

	if (!reportId) {
		return json({ error: 'Report ID required' }, { status: 400 })
	}

	const report = await prisma.customReport.findFirst({
		where: {
			id: reportId,
			...tenantFilter,
			createdById: user.id,
		},
	})

	if (!report) {
		return json({ error: 'Report not found' }, { status: 404 })
	}

	await prisma.customReport.delete({
		where: { id: reportId },
	})

	return redirect('/admin/reports/custom')
}

export default function DeleteCustomReportRoute() {
	const { report } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const isDeleting = navigation.state !== 'idle'

	return (
		<div className="mx-auto max-w-md space-y-6">
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" asChild>
					<Link to={`/admin/reports/custom/${report.id}`}>
						<ArrowLeft className="h-5 w-5" />
					</Link>
				</Button>
				<h1 className="text-2xl font-bold">Delete Report</h1>
			</div>

			<Card className="border-destructive">
				<CardHeader>
					<div className="flex items-center gap-3">
						<div className="rounded-full bg-destructive/10 p-2">
							<AlertTriangle className="h-5 w-5 text-destructive" />
						</div>
						<div>
							<CardTitle>Confirm Deletion</CardTitle>
							<CardDescription>
								This action cannot be undone.
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<p className="text-sm">
						Are you sure you want to delete the report{' '}
						<strong>"{report.name}"</strong>?
					</p>
					{report.description && (
						<p className="mt-2 text-sm text-muted-foreground">
							{report.description}
						</p>
					)}
				</CardContent>
				<CardFooter className="flex gap-3">
					<Button variant="outline" asChild className="flex-1">
						<Link to={`/admin/reports/custom/${report.id}`}>Cancel</Link>
					</Button>
					<Form method="POST" className="flex-1">
						<Button
							type="submit"
							variant="destructive"
							className="w-full"
							disabled={isDeleting}
						>
							{isDeleting ? 'Deleting...' : 'Delete Report'}
						</Button>
					</Form>
				</CardFooter>
			</Card>
		</div>
	)
}
