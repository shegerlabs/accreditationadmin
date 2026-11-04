// manage-permission.ts
// Interactive script to create or update permissions
//
// USAGE:
//   npm run manage-permission
//   OR
//   npx tsx prisma/manage-permission.ts
//
// FEATURES:
//   - Create new permissions
//   - Update existing permissions (with role assignment)
//   - Delete permissions
//   - List all permissions
//   - Bulk create common permissions
//   - Prevents duplicate permissions (by action+entity+access)
//
// NOTES:
//   - This script is idempotent (safe to run multiple times)
//   - Will update existing permissions instead of creating duplicates

import { PrismaClient } from '@prisma/client'
import prompts from 'prompts'
import { printTable } from './utils/table.js'

const prisma = new PrismaClient()

// Common permission actions
const COMMON_ACTIONS = ['create', 'read', 'update', 'delete', 'manage']

// Common entities
const COMMON_ENTITIES = [
	'user',
	'role',
	'permission',
	'participant',
	'event',
	'workflow',
	'tenant',
	'menu',
]

// Common access levels
const ACCESS_LEVELS = ['own', 'any']

async function managePermission() {
	console.log('🔐 Interactive Permission Manager\n')
	console.log('This tool helps you create or update permissions.\n')

	let continueLoop = true

	while (continueLoop) {
		try {
			// 1. Fetch all existing permissions
			const existingPermissions = await prisma.permission.findMany({
				orderBy: [{ entity: 'asc' }, { action: 'asc' }],
				include: { roles: true },
			})

			// 2. Fetch all roles for assignment
			const allRoles = await prisma.role.findMany({
				orderBy: { name: 'asc' },
			})

			// 3. Determine action
			const actionResponse = await prompts({
				type: 'select',
				name: 'action',
				message: 'What would you like to do?',
				choices: [
					{ title: 'Create a new permission', value: 'create' },
					{ title: 'Update an existing permission', value: 'update' },
					{ title: 'Delete a permission', value: 'delete' },
					{ title: 'List all permissions', value: 'list' },
					{ title: 'Bulk create common permissions', value: 'bulk' },
					{ title: '─'.repeat(20), value: 'separator', disabled: true },
					{ title: '❌ Exit', value: 'exit' },
				],
			})

			if (!actionResponse.action || actionResponse.action === 'exit') {
				console.log('\n👋 Goodbye!')
				continueLoop = false
				break
			}

			const action = actionResponse.action

			// Handle list action
			if (action === 'list') {
				console.log('\n📋 Existing Permissions:\n')
				printTable(
					[
						{ header: 'Action', key: 'action', width: 12 },
						{ header: 'Entity', key: 'entity', width: 15 },
						{ header: 'Access', key: 'access', width: 8 },
						{ header: 'Description', key: 'description', width: 30 },
					],
					existingPermissions.map(p => ({
						action: p.action,
						entity: p.entity,
						access: p.access,
						description: p.description || '-',
					})),
				)
				console.log(`Total: ${existingPermissions.length} permissions\n`)
				continue
			}

			// Handle bulk create
			if (action === 'bulk') {
				const bulkResponse = await prompts([
					{
						type: 'multiselect',
						name: 'entities',
						message: 'Select entities to create permissions for:',
						choices: COMMON_ENTITIES.map(e => ({
							title: e,
							value: e,
						})),
						hint: '- Space to select, Enter to confirm',
					},
					{
						type: 'multiselect',
						name: 'actions',
						message: 'Select actions to create:',
						choices: COMMON_ACTIONS.map(a => ({
							title: a,
							value: a,
						})),
						hint: '- Space to select, Enter to confirm',
					},
				])

				if (!bulkResponse.entities?.length || !bulkResponse.actions?.length) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				console.log('\n📝 Creating permissions...')
				let created = 0
				let skipped = 0

				for (const entity of bulkResponse.entities) {
					for (const permAction of bulkResponse.actions) {
						for (const access of ACCESS_LEVELS) {
							const exists = existingPermissions.find(
								p =>
									p.action === permAction &&
									p.entity === entity &&
									p.access === access,
							)

							if (exists) {
								skipped++
								continue
							}

							await prisma.permission.create({
								data: {
									action: permAction,
									entity,
									access,
									description: `${permAction} ${access} ${entity}`,
								},
							})
							created++
							console.log(`  ✓ Created: ${permAction}:${entity}:${access}`)
						}
					}
				}

				console.log(`\n✅ Created ${created} permissions, skipped ${skipped} existing\n`)
				continue
			}

			let selectedPermissionId: string | undefined

			// Handle update/delete - select permission
			if (action === 'update' || action === 'delete') {
				if (existingPermissions.length === 0) {
					console.log('\n❌ No permissions found\n')
					continue
				}

				const permResponse = await prompts({
					type: 'select',
					name: 'permissionId',
					message: `Select the permission to ${action}:`,
					choices: existingPermissions.map(p => ({
						title: `${p.action}:${p.entity}:${p.access}`,
						description: p.description || '',
						value: p.id,
					})),
				})

				if (!permResponse.permissionId) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				selectedPermissionId = permResponse.permissionId

				// Handle delete
				if (action === 'delete') {
					const selectedPerm = existingPermissions.find(
						p => p.id === selectedPermissionId,
					)
					const confirmResponse = await prompts({
						type: 'confirm',
						name: 'confirm',
						message: `Are you sure you want to delete permission "${selectedPerm?.action}:${selectedPerm?.entity}:${selectedPerm?.access}"?`,
						initial: false,
					})

					if (!confirmResponse.confirm) {
						console.log('\n❌ Operation cancelled\n')
						continue
					}

					await prisma.permission.delete({
						where: { id: selectedPermissionId },
					})

					console.log(
						`\n✅ Deleted permission: ${selectedPerm?.action}:${selectedPerm?.entity}:${selectedPerm?.access}\n`,
					)
					continue
				}
			}

			// 4. Get permission data
			let existingPermission: (typeof existingPermissions)[0] | undefined
			if (action === 'update' && selectedPermissionId) {
				existingPermission = existingPermissions.find(
					p => p.id === selectedPermissionId,
				)
			}

			// 5. Interactive prompts
			const dataResponse = await prompts([
				{
					type: 'autocomplete',
					name: 'permAction',
					message: 'Enter action (e.g., create, read, update, delete):',
					choices: COMMON_ACTIONS.map(a => ({ title: a, value: a })),
					initial: existingPermission?.action,
					suggest: (input: string, choices: any[]) =>
						Promise.resolve(
							choices.filter(c =>
								c.title.toLowerCase().includes(input.toLowerCase()),
							),
						),
				},
				{
					type: 'autocomplete',
					name: 'entity',
					message: 'Enter entity (e.g., user, participant, event):',
					choices: COMMON_ENTITIES.map(e => ({ title: e, value: e })),
					initial: existingPermission?.entity,
					suggest: (input: string, choices: any[]) =>
						Promise.resolve(
							choices.filter(c =>
								c.title.toLowerCase().includes(input.toLowerCase()),
							),
						),
				},
				{
					type: 'select',
					name: 'access',
					message: 'Select access level:',
					choices: ACCESS_LEVELS.map(a => ({ title: a, value: a })),
					initial: ACCESS_LEVELS.indexOf(existingPermission?.access || 'own'),
				},
				{
					type: 'text',
					name: 'description',
					message: 'Enter description (optional):',
					initial: existingPermission?.description || '',
				},
			])

			if (!dataResponse.permAction || !dataResponse.entity || !dataResponse.access) {
				console.log('\n❌ Operation cancelled\n')
				continue
			}

			const permAction = dataResponse.permAction.trim()
			const entity = dataResponse.entity.trim()
			const access = dataResponse.access
			const description = dataResponse.description?.trim() || null

			// 6. Check for duplicates
			const duplicate = existingPermissions.find(
				p =>
					p.id !== selectedPermissionId &&
					p.action === permAction &&
					p.entity === entity &&
					p.access === access,
			)

			if (duplicate) {
				console.log(
					`\n❌ Permission "${permAction}:${entity}:${access}" already exists\n`,
				)
				continue
			}

			// 7. Role assignment (only for update)
			let selectedRoleIds: string[] =
				existingPermission?.roles.map(r => r.id) || []

			if (action === 'update' && allRoles.length > 0) {
				const roleResponse = await prompts({
					type: 'multiselect',
					name: 'roles',
					message: 'Select roles for this permission:',
					choices: allRoles.map(r => ({
						title: r.name,
						description: r.description || '',
						value: r.id,
						selected: selectedRoleIds.includes(r.id),
					})),
					hint: '- Space to select, Enter to confirm',
				})

				if (roleResponse.roles) {
					selectedRoleIds = roleResponse.roles
				}
			}

			// 8. Create or update permission
			if (action === 'update' && selectedPermissionId) {
				console.log('\n📝 Updating permission...')

				const permission = await prisma.permission.update({
					where: { id: selectedPermissionId },
					data: {
						action: permAction,
						entity,
						access,
						description,
						roles: {
							set: selectedRoleIds.map(id => ({ id })),
						},
					},
				})

				console.log(
					`✅ Updated permission: ${permission.action}:${permission.entity}:${permission.access}\n`,
				)
			} else {
				console.log('\n📝 Creating new permission...')

				const permission = await prisma.permission.create({
					data: {
						action: permAction,
						entity,
						access,
						description,
					},
				})

				console.log(
					`✅ Created permission: ${permission.action}:${permission.entity}:${permission.access}\n`,
				)
			}
		} catch (error) {
			console.error('❌ Error:', error)
			console.log('')
		}
	}
}

managePermission()
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
