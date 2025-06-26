import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType, UserStatus } from '@prisma/client'
import {
	ActionFunctionArgs,
	LoaderFunctionArgs,
	unstable_createMemoryUploadHandler as createMemoryUploadHandler,
	json,
	unstable_parseMultipartFormData as parseMultipartFormData,
} from '@remix-run/node'
import { Form, Link, useActionData, useNavigation } from '@remix-run/react'
import Papa from 'papaparse'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024 // 5MB

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	return json({})
}

const UserImportSchema = z.object({
	csvFile: z
		.instanceof(File)
		.refine(
			file => file.size <= MAX_UPLOAD_SIZE,
			'File size must be less than 5MB',
		)
		.refine(
			file => file.type === 'text/csv' || file.name.endsWith('.csv'),
			'Only CSV files are allowed',
		),
})

type ActionData = {
	status: 'error'
	message: string
	errors?: Array<{ message: string; row?: number }>
} | null

interface CSVRow {
	email: string
	name: string
	username?: string
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin'])

	const uploadHandler = createMemoryUploadHandler({
		maxPartSize: MAX_UPLOAD_SIZE,
	})

	const formData = await parseMultipartFormData(request, uploadHandler)

	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = parseWithZod(formData, {
		schema: UserImportSchema,
		async: false,
	})

	if (submission.status !== 'success') {
		return json<ActionData>({
			status: 'error',
			message: 'Invalid submission',
			errors: Object.values(submission.error?.errors ?? {}).map(errors => ({
				message: errors?.[0] ?? 'Unknown error',
			})),
		})
	}

	const file = submission.value.csvFile
	const text = await file.text()

	const results = Papa.parse<CSVRow>(text, {
		header: true,
		skipEmptyLines: true,
	})

	if (results.errors.length > 0) {
		return json<ActionData>({
			status: 'error',
			message: 'Failed to parse CSV file',
			errors: results.errors.map(error => ({
				message: error.message,
				row: error.row,
			})),
		})
	}

	const users = results.data.map(row => ({
		email: row.email?.trim(),
		name: row.name?.trim(),
		username: (row.username || row.email?.split('@')[0])?.trim(),
		status: UserStatus.ACTIVE,
	}))

	try {
		await prisma.$transaction(
			users.map(user =>
				prisma.user.upsert({
					where: { email: user.email },
					create: user,
					update: {
						name: user.name,
						username: user.username,
						status: UserStatus.ACTIVE,
					},
				}),
			),
		)

		await auditRequest({
			request,
			action: AuditAction.IMPORT,
			entityType: AuditEntityType.USER,
			entityId: 'import',
			description: 'Users imported',
			userId: user.id,
			metadata: {
				users,
			},
		})

		return redirectWithToast('/admin/users', {
			type: 'success',
			title: 'Users Imported',
			description: `Successfully imported/updated ${users.length} users`,
		})
	} catch (error) {
		return json<ActionData>({
			status: 'error',
			message: 'Failed to import users. Please check your CSV format.',
			errors: [
				{ message: error instanceof Error ? error.message : 'Unknown error' },
			],
		})
	}
}

export default function ImportUsersPage() {
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const isSubmitting = navigation.state === 'submitting'

	return (
		<Card>
			<CardHeader>
				<CardTitle>Import Users</CardTitle>
				<CardDescription>
					Upload a CSV file to bulk import users. The CSV should contain columns
					for email, name, and optionally username.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form method="post" encType="multipart/form-data">
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<div className="grid w-full gap-4">
						<div>
							<input
								type="file"
								name="csvFile"
								accept=".csv"
								className="cursor-pointer rounded-md border p-2"
								required
							/>
							{actionData?.status === 'error' ? (
								<div className="mt-2 text-sm text-red-500">
									<p>{actionData.message}</p>
									{actionData.errors?.map((error, index) => (
										<p key={index}>
											{error.row ? `Row ${error.row}: ` : ''}
											{error.message}
										</p>
									))}
								</div>
							) : null}
						</div>
						<div className="flex gap-2">
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? 'Importing...' : 'Import Users'}
							</Button>
							<Button variant="outline" asChild>
								<Link to="..">Cancel</Link>
							</Button>
						</div>
					</div>
				</Form>
			</CardContent>
		</Card>
	)
}
