import { type LoaderFunctionArgs } from '@remix-run/node'
import { requireGlobalAdmin } from '~/utils/auth.server'
import { getBackupBuffer } from '~/utils/backup.server'
import { prisma } from '~/utils/db.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	try {
		await requireGlobalAdmin(request)
	} catch {
		return new Response('Unauthorized', { status: 401 })
	}

	const { backupId } = params

	if (!backupId) {
		return new Response('Backup ID is required', { status: 400 })
	}

	const backup = await prisma.databaseBackup.findUnique({
		where: { id: backupId },
	})

	if (!backup) {
		return new Response('Backup not found', { status: 404 })
	}

	if (backup.status !== 'COMPLETED') {
		return new Response('Backup is not complete', { status: 400 })
	}

	try {
		const buffer = await getBackupBuffer(backupId)

		// Extract just the filename from the path
		const fileName = backup.fileName.split('/').pop() || 'backup.gz'

		return new Response(buffer, {
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Disposition': `attachment; filename="${fileName}"`,
				'Content-Length': buffer.length.toString(),
				'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
				'Pragma': 'no-cache',
				'Expires': '0',
				'X-Content-Type-Options': 'nosniff',
			},
		})
	} catch (error) {
		console.error('Error downloading backup:', error)
		return new Response('Failed to download backup', { status: 500 })
	}
}
