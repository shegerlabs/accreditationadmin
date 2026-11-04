import { getFormProps, useForm } from '@conform-to/react'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Form, useLoaderData, useNavigate, useNavigation } from '@remix-run/react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { StatusButton } from '~/components/ui/status-button'
import { auditRequest } from '~/utils/audit.server'
import { requireGlobalAdmin } from '~/utils/auth.server'
import { deleteBackup } from '~/utils/backup.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

function formatSize(bytes: string): string {
	const numBytes = Number(bytes)
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	let unitIndex = 0
	let size = numBytes

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024
		unitIndex++
	}

	return `${size.toFixed(2)} ${units[unitIndex]}`
}

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireGlobalAdmin(request)
	const { backupId } = params

	const backup = await prisma.databaseBackup.findUnique({
		where: { id: backupId },
	})

	invariantResponse(backup, 'Backup not found', { status: 404 })

	return json({
		backup: {
			id: backup.id,
			name: backup.name,
			sizeBytes: backup.sizeBytes.toString(),
			status: backup.status,
		},
	})
}

export async function action({ params, request }: ActionFunctionArgs) {
	const user = await requireGlobalAdmin(request)
	const { backupId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const backup = await prisma.databaseBackup.findUnique({
		where: { id: backupId },
	})

	invariantResponse(backup, 'Backup not found', { status: 404 })

	try {
		await deleteBackup(backupId!)

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.BACKUP,
			entityId: backupId,
			description: `Database backup deleted: ${backup.name}`,
			userId: user.id,
			metadata: {
				backupId: backup.id,
				backupName: backup.name,
				fileName: backup.fileName,
			},
		})

		return redirectWithToast('/admin/backups', {
			type: 'success',
			title: 'Backup Deleted',
			description: `Backup "${backup.name}" has been deleted.`,
		})
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Failed to delete backup'

		return redirectWithToast(`/admin/backups/${backupId}`, {
			type: 'error',
			title: 'Delete Failed',
			description: errorMessage,
		})
	}
}

export default function DeleteBackupRoute() {
	const { backup } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const navigation = useNavigation()
	const isSubmitting = navigation.state === 'submitting'

	const [form] = useForm({
		id: 'delete-backup-form',
	})

	const returnUrl = '/admin/backups'

	return (
		<Dialog open onOpenChange={() => navigate(returnUrl)}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-destructive">
						<AlertTriangle className="h-5 w-5" />
						Delete Backup
					</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete this backup? This action cannot be
						undone.
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-lg border bg-muted/50 p-4">
					<p className="font-medium">{backup.name}</p>
					<p className="text-sm text-muted-foreground">
						Size: {formatSize(backup.sizeBytes)}
					</p>
					<p className="text-sm text-muted-foreground">
						Status: {backup.status}
					</p>
				</div>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate(returnUrl)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<StatusButton
							type="submit"
							variant="destructive"
							status={isSubmitting ? 'pending' : 'idle'}
							disabled={isSubmitting}
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete Backup
						</StatusButton>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
