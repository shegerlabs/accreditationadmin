// lib/confirm.ts
// The typed confirmation gate shared by the destructive scripts.

import prompts from 'prompts'

/**
 * Require the operator to type the target database's name.
 *
 * Deliberately not a yes/no: this server hosts more than one similarly-named
 * database, and typing the name is what proves the operator knows which one
 * they are about to destroy.
 *
 * The expected name comes from `describeTarget`, whose hand-rolled parser is
 * used because `new URL()` mis-handles the unencoded '@' in this deployment's
 * password.
 */
export async function confirmDatabaseName(
	databaseName: string,
	message: string,
) {
	const { proceed } = await prompts({
		type: 'text',
		name: 'proceed',
		message,
	})

	if (proceed !== databaseName) {
		console.log(
			`\nAborted: expected "${databaseName}", got "${proceed ?? ''}". Nothing changed.`,
		)
		return false
	}
	return true
}
