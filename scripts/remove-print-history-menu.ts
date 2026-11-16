// remove-print-history-menu.ts
// One-off: delete the Print History menu item. Print history is now the print
// queue's Status filter (/printer/requests?status=printed-today), and the
// /printer/history route is gone, so the item would lead to a 404.
//
// USAGE:
//   npx tsx scripts/remove-print-history-menu.ts             # DRY RUN (default)
//   npx tsx scripts/remove-print-history-menu.ts --confirm   # Back up, then apply
//
// Only MenuItem rows (and, by cascade, their role links) are deleted; nothing
// references a menu item. --confirm asks for the database name and runs
// scripts/accreditation.sh before the write.

import { type Prisma, PrismaClient } from '@prisma/client'
import { runBackupGate } from './lib/backup.js'
import { confirmDatabaseName } from './lib/confirm.js'
import { describeTarget, printBanner } from './lib/target.js'

const prisma = new PrismaClient()

const OBSOLETE_LINK: Prisma.MenuItemWhereInput = {
	link: { startsWith: '/printer/history' },
}

function findItems() {
	return prisma.menuItem.findMany({
		where: OBSOLETE_LINK,
		select: { title: true, link: true },
	})
}

async function main() {
	const confirm = process.argv.includes('--confirm')
	const target = describeTarget()
	printBanner(
		confirm
			? 'REMOVE PRINT HISTORY MENU — LIVE RUN'
			: 'REMOVE PRINT HISTORY MENU — DRY RUN',
		target,
	)

	const items = await findItems()
	console.log(`\nMenu items to remove: ${items.length}`)
	for (const m of items) console.log(`  - ${m.title} (${m.link})`)

	if (items.length === 0) {
		console.log('\nNothing to do.')
		return
	}
	if (!confirm) {
		console.log('\nDry run — nothing was changed.')
		console.log('Re-run with --confirm to take a backup and apply.\n')
		return
	}

	const confirmed = await confirmDatabaseName(
		target.name,
		'Type the database name to remove the Print History menu item',
	)
	if (!confirmed) {
		process.exitCode = 1
		return
	}
	runBackupGate()
	await prisma.menuItem.deleteMany({ where: OBSOLETE_LINK })

	const left = await findItems()
	if (left.length > 0) {
		console.log(`\n✗ ${left.length} menu item(s) left over.`)
		process.exitCode = 1
		return
	}
	console.log('\nPrint History menu item removed and verified.\n')
}

main()
	.catch(e => {
		console.error(`\n${e instanceof Error ? e.message : String(e)}`)
		process.exitCode = 1
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
