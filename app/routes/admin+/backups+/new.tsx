import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Form, useActionData, useNavigate, useNavigation } from '@remix-run/react'
import { Database } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { ErrorList } from '~/components/forms'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { StatusButton } from '~/components/ui/status-button'
import { auditRequest } from '~/utils/audit.server'
import { requireGlobalAdmin } from '~/utils/auth.server'
import { createBackup } from '~/utils/backup.server'
import { validateCSRF } from '~/utils/csrf.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'

const CreateBackupSchema = z.object({
	name: z.string().max(100).optional(),
})

export async function loader({ request }: LoaderFunctionArgs) {
	await requireGlobalAdmin(request)
	return json({})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireGlobalAdmin(request)

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = parseWithZod(formData, { schema: CreateBackupSchema })

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 }
		)
	}

	try {
		const backup = await createBackup({
			userId: user.id,
			name: submission.value.name || undefined,
		})

		await auditRequest({
			request,
			action: AuditAction.CREATE,
			entityType: AuditEntityType.BACKUP,
			entityId: backup.id,
			description: `Database backup created: ${backup.name}`,
			userId: user.id,
			metadata: {
				backupId: backup.id,
				backupName: backup.name,
				fileName: backup.fileName,
			},
		})

		return redirectWithToast('/admin/backups', {
			type: 'success',
			title: 'Backup Created',
			description: `Backup "${backup.name}" has been created successfully.`,
		})
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Failed to create backup'

		return json(
			{
				result: submission.reply({
					formErrors: [errorMessage],
				}),
			},
			{ status: 500 }
		)
	}
}

export default function NewBackupRoute() {
	const actionData = useActionData<typeof action>()
	const navigate = useNavigate()
	const navigation = useNavigation()
	const isSubmitting = navigation.state === 'submitting'

	const [form, fields] = useForm({
		id: 'create-backup-form',
		constraint: getZodConstraint(CreateBackupSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: CreateBackupSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
	})

	return (
		<Dialog open onOpenChange={() => navigate('/admin/backups')}>
			<DialogContent
				className="sm:max-w-md"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Database className="h-5 w-5" />
						Create Database Backup
					</DialogTitle>
					<DialogDescription>
						Create a new backup of the entire database. This may take a few
						minutes depending on the database size.
					</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor={fields.name.id}>
								Backup Name{' '}
								<span className="text-muted-foreground">(optional)</span>
							</Label>
							<Input
								{...getInputProps(fields.name, { type: 'text' })}
								placeholder="e.g., Before migration, Weekly backup"
							/>
							<p className="text-xs text-muted-foreground">
								If left empty, a name will be auto-generated with the current
								timestamp.
							</p>
							{fields.name.errors && (
								<p className="text-sm text-destructive">{fields.name.errors}</p>
							)}
						</div>

						<ErrorList id={form.errorId} errors={form.errors} />
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate('/admin/backups')}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<StatusButton
							type="submit"
							status={isSubmitting ? 'pending' : 'idle'}
							disabled={isSubmitting}
						>
							<Database className="mr-2 h-4 w-4" />
							Create Backup
						</StatusButton>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
