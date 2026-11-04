// migrate-multi-tenancy.ts
// Migration script for multi-tenancy security refactor
//
// USAGE:
//   npx tsx scripts/migrate-multi-tenancy.ts
//   OR
//   npx tsx scripts/migrate-multi-tenancy.ts --dry-run
//
// FEATURES:
//   - Sets role scopes (GLOBAL, TENANT, EVENT)
//   - Creates UserEventAccess records for existing validators
//   - Reports users without tenant assignment
//
// NOTES:
//   - Run with --dry-run first to preview changes
//   - This script is idempotent (safe to run multiple times)
//   - Existing UserEventAccess records are preserved

import { PrismaClient, RoleScope } from '@prisma/client'
import { printTable } from './utils/table.js'

const prisma = new PrismaClient()

// Role scope mappings
const ROLE_SCOPES: Record<string, RoleScope> = {
	admin: 'GLOBAL',
	tenant: 'TENANT',
	user: 'TENANT',
	// All others default to EVENT
}

// Roles that need UserEventAccess records
const EVENT_ROLES = ['focal', 'reviewer', 'validator', 'printer']

interface MigrationStats {
	rolesUpdated: number
	accessRecordsCreated: number
	accessRecordsSkipped: number
	usersWithoutTenant: string[]
}

async function migrateMultiTenancy(dryRun: boolean): Promise<MigrationStats> {
	const stats: MigrationStats = {
		rolesUpdated: 0,
		accessRecordsCreated: 0,
		accessRecordsSkipped: 0,
		usersWithoutTenant: [],
	}

	console.log('🔄 Multi-Tenancy Migration Script\n')
	console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes will be made)' : '⚡ LIVE RUN'}\n`)

	// Phase 1: Update Role Scopes
	console.log('━'.repeat(60))
	console.log('Phase 1: Updating Role Scopes')
	console.log('━'.repeat(60))

	const allRoles = await prisma.role.findMany({
		select: {
			id: true,
			name: true,
			scope: true,
		},
	})

	const roleUpdates: { name: string; from: string; to: string }[] = []

	for (const role of allRoles) {
		const targetScope = ROLE_SCOPES[role.name] || 'EVENT'

		if (role.scope !== targetScope) {
			roleUpdates.push({
				name: role.name,
				from: role.scope,
				to: targetScope,
			})

			if (!dryRun) {
				await prisma.role.update({
					where: { id: role.id },
					data: { scope: targetScope },
				})
			}

			stats.rolesUpdated++
		}
	}

	if (roleUpdates.length > 0) {
		console.log('\nRole scope changes:')
		printTable(
			[
				{ header: 'Role', key: 'name', width: 20 },
				{ header: 'From', key: 'from', width: 15 },
				{ header: 'To', key: 'to', width: 15 },
			],
			roleUpdates,
		)
	} else {
		console.log('\n✅ All role scopes are already correct')
	}

	// Phase 2: Find users without tenant
	console.log('\n' + '━'.repeat(60))
	console.log('Phase 2: Checking Users Without Tenant')
	console.log('━'.repeat(60))

	const usersWithoutTenant = await prisma.user.findMany({
		where: {
			tenantId: null,
			roles: {
				some: {
					name: { in: EVENT_ROLES },
				},
			},
		},
		select: {
			id: true,
			username: true,
			email: true,
			roles: {
				select: { name: true },
			},
		},
	})

	if (usersWithoutTenant.length > 0) {
		console.log('\n⚠️  WARNING: The following users have event roles but no tenant:')
		printTable(
			[
				{ header: 'Username', key: 'username', width: 20 },
				{ header: 'Email', key: 'email', width: 30 },
				{ header: 'Roles', key: 'roles', width: 30 },
			],
			usersWithoutTenant.map(u => ({
				username: u.username,
				email: u.email,
				roles: u.roles.map(r => r.name).join(', '),
			})),
		)
		console.log('\n⚠️  These users need to be assigned to a tenant to use the new access system.')
		stats.usersWithoutTenant = usersWithoutTenant.map(u => u.username)
	} else {
		console.log('\n✅ All users with event roles have tenant assignments')
	}

	// Phase 3: Create UserEventAccess records
	console.log('\n' + '━'.repeat(60))
	console.log('Phase 3: Creating UserEventAccess Records')
	console.log('━'.repeat(60))

	// Get users with event roles who have tenants
	const usersWithEventRoles = await prisma.user.findMany({
		where: {
			tenantId: { not: null },
			roles: {
				some: {
					name: { in: EVENT_ROLES },
				},
			},
		},
		select: {
			id: true,
			username: true,
			tenantId: true,
			roles: {
				where: {
					name: { in: EVENT_ROLES },
				},
				select: {
					id: true,
					name: true,
				},
			},
		},
	})

	console.log(`\nFound ${usersWithEventRoles.length} users with event roles and tenant assignments`)

	const accessRecords: { user: string; event: string; role: string; step: string | null }[] = []

	for (const user of usersWithEventRoles) {
		// Get all events for this user's tenant
		const events = await prisma.event.findMany({
			where: { tenantId: user.tenantId! },
			select: {
				id: true,
				name: true,
				workflows: {
					select: {
						steps: {
							select: {
								id: true,
								name: true,
								roleId: true,
							},
						},
					},
				},
			},
		})

		for (const role of user.roles) {
			for (const event of events) {
				// For validator roles, find steps that match their role
				const matchingSteps = event.workflows.flatMap(w =>
					w.steps.filter(s => s.roleId === role.id),
				)

				if (matchingSteps.length > 0) {
					// Create access for specific steps
					for (const step of matchingSteps) {
						// Check if record already exists
						const existing = await prisma.userEventAccess.findFirst({
							where: {
								userId: user.id,
								eventId: event.id,
								roleId: role.id,
								stepId: step.id,
							},
						})

						if (existing) {
							stats.accessRecordsSkipped++
							continue
						}

						accessRecords.push({
							user: user.username,
							event: event.name,
							role: role.name,
							step: step.name,
						})

						if (!dryRun) {
							await prisma.userEventAccess.create({
								data: {
									userId: user.id,
									eventId: event.id,
									roleId: role.id,
									stepId: step.id,
								},
							})
						}

						stats.accessRecordsCreated++
					}
				} else {
					// For roles without step matches (e.g., focal), create event-wide access
					const existing = await prisma.userEventAccess.findFirst({
						where: {
							userId: user.id,
							eventId: event.id,
							roleId: role.id,
							stepId: null,
						},
					})

					if (existing) {
						stats.accessRecordsSkipped++
						continue
					}

					accessRecords.push({
						user: user.username,
						event: event.name,
						role: role.name,
						step: null,
					})

					if (!dryRun) {
						await prisma.userEventAccess.create({
							data: {
								userId: user.id,
								eventId: event.id,
								roleId: role.id,
								stepId: null,
							},
						})
					}

					stats.accessRecordsCreated++
				}
			}
		}
	}

	if (accessRecords.length > 0) {
		console.log('\nUserEventAccess records to create:')
		// Show first 20 records
		const displayRecords = accessRecords.slice(0, 20)
		printTable(
			[
				{ header: 'User', key: 'user', width: 20 },
				{ header: 'Event', key: 'event', width: 25 },
				{ header: 'Role', key: 'role', width: 20 },
				{ header: 'Step', key: 'step', width: 20 },
			],
			displayRecords.map(r => ({
				...r,
				step: r.step || '(all steps)',
			})),
		)

		if (accessRecords.length > 20) {
			console.log(`... and ${accessRecords.length - 20} more records`)
		}
	}

	// Summary
	console.log('\n' + '━'.repeat(60))
	console.log('Migration Summary')
	console.log('━'.repeat(60))

	console.log(`
Roles updated:              ${stats.rolesUpdated}
Access records created:     ${stats.accessRecordsCreated}
Access records skipped:     ${stats.accessRecordsSkipped} (already exist)
Users without tenant:       ${stats.usersWithoutTenant.length}
`)

	if (dryRun) {
		console.log('🔍 This was a DRY RUN - no changes were made.')
		console.log('   Run without --dry-run to apply changes.')
	} else {
		console.log('✅ Migration completed successfully!')
	}

	return stats
}

// Main execution
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

migrateMultiTenancy(dryRun)
	.catch(error => {
		console.error('❌ Migration failed:', error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
