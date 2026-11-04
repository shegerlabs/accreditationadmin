// lib/target.ts
// Identify the database a script is about to act on.

/**
 * Parse the target database name and host out of DATABASE_URL, without ever
 * exposing the password.
 *
 * This server hosts more than one similarly-named database (`accreditation`
 * and `papaccreditation`). Showing the exact target is the difference between
 * acting on the right one and the wrong one, so it is printed on every run.
 */
export function describeTarget() {
	const raw = process.env.DATABASE_URL
	if (!raw) throw new Error('DATABASE_URL is not set.')
	// Split credentials from host on the LAST '@'; passwords may contain '@'.
	const afterProto = raw.slice(raw.indexOf('://') + 3)
	const hostPath = afterProto.slice(afterProto.lastIndexOf('@') + 1)
	const host = hostPath.split('/')[0]
	const name = (hostPath.split('/')[1] ?? '').split('?')[0]
	if (!name)
		throw new Error(`Could not parse a database name from DATABASE_URL.`)
	return { name, host }
}

export function printBanner(
	title: string,
	target: { name: string; host: string },
) {
	console.log('='.repeat(64))
	console.log(title)
	console.log('='.repeat(64))
	console.log(`  Database: ${target.name}`)
	console.log(`  Host:     ${target.host}`)
	console.log('='.repeat(64))
}
