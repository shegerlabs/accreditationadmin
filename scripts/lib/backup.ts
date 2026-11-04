// lib/backup.ts
// The backup gate. No verified backup, no mutation.

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// package.json sets "type": "module", so __dirname is not defined.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Run scripts/accreditation.sh as a gate. Throws if it fails, which aborts
 * whatever the caller was about to do.
 *
 * Every destructive script calls this BEFORE its first write, never after.
 */
export function runBackupGate() {
	const script = path.join(__dirname, '..', 'accreditation.sh')
	console.log(`\nRunning backup gate: ${script}`)
	console.log('Nothing is written unless this succeeds.\n')

	// A dump that has never been restored is a hypothesis, not a backup. The
	// v17-client failure mode is the concrete case: the dump is complete,
	// correctly sized, exits 0, and cannot be restored into a v16 server.
	// accreditation.sh only checks restorability when VERIFY_RESTORE_URL is set,
	// so say so loudly rather than letting an unproven dump gate a wipe quietly.
	if (!process.env.VERIFY_RESTORE_URL) {
		console.log(
			'⚠  VERIFY_RESTORE_URL is not set. The backup will be checked for\n' +
				'   completeness but NOT for restorability. Set it to a throwaway\n' +
				'   database to have the dump restored and row-counted before it is\n' +
				'   trusted to gate an irreversible purge:\n\n' +
				"     export VERIFY_RESTORE_URL='postgresql://user:pass@host:5432/scratch_restore_check'\n",
		)
	}

	const result = spawnSync('bash', [script], { stdio: 'inherit' })

	if (result.error) {
		throw new Error(`Backup gate could not run: ${result.error.message}`)
	}
	if (result.status !== 0) {
		throw new Error(
			`Backup FAILED (exit ${result.status}). Nothing has been changed.`,
		)
	}
	console.log('\nBackup gate passed.')
}
