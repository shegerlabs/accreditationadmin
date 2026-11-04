// manage-role.ts
// Interactive script to create or update roles
//
// USAGE:
//   npm run manage-role
//   OR
//   npx tsx prisma/manage-role.ts
//
// FEATURES:
//   - Create new roles
//   - Update existing roles (with permission assignment)
//   - Delete roles
//   - List all roles
//   - Prevents duplicate roles (by name)
//
// NOTES:
//   - This script is idempotent (safe to run multiple times)
//   - Will update existing roles instead of creating duplicates

import { PrismaClient } from '@prisma/client'
import prompts from 'prompts'
import { printTable } from './utils/table.js'

const prisma = new PrismaClient()

async function manageRole() {
	console.log('👤 Interactive Role Manager\n')
	console.log('This tool helps you create or update roles.\n')

	let continueLoop = true

	while (continueLoop) {
		try {
			// 1. Fetch all existing roles
			const existingRoles = await prisma.role.findMany({
				orderBy: { name: 'asc' },
				include: { permissions: true },
			})

			// 2. Fetch all permissions for assignment
			const allPermissions = await prisma.permission.findMany({
				orderBy: [{ entity: 'asc' }, { action: 'asc' }],
			})

			// 3. Determine action (create or update)
			let selectedRoleId: string | undefined

			const actionResponse = await prompts({
				type: 'select',
				name: 'action',
				message: 'What would you like to do?',
				choices: [
					{ title: 'Create a new role', value: 'create' },
					{ title: 'Update an existing role', value: 'update' },
					{ title: 'Delete a role', value: 'delete' },
					{ title: 'List all roles', value: 'list' },
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
				console.log('\n📋 Existing Roles:\n')
				printTable(
					[
						{ header: 'Name', key: 'name', width: 25 },
						{ header: 'Description', key: 'description', width: 40 },
						{ header: 'Permissions', key: 'permCount', width: 12 },
					],
					existingRoles.map(r => ({
						name: r.name,
						description: r.description || '-',
						permCount: r.permissions.length,
					})),
				)
				console.log(`Total: ${existingRoles.length} roles\n`)
				continue
			}

			// Handle update/delete - select role
			if (action === 'update' || action === 'delete') {
				if (existingRoles.length === 0) {
					console.log('\n❌ No roles found to update/delete\n')
					continue
				}

				const roleResponse = await prompts({
					type: 'select',
					name: 'roleId',
					message: `Select the role to ${action}:`,
					choices: existingRoles.map(role => ({
						title: `${role.name} - ${role.description || 'No description'}`,
						value: role.id,
					})),
				})

				if (!roleResponse.roleId) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				selectedRoleId = roleResponse.roleId

				// Handle delete
				if (action === 'delete') {
					const selectedRole = existingRoles.find(r => r.id === selectedRoleId)
					const confirmResponse = await prompts({
						type: 'confirm',
						name: 'confirm',
						message: `Are you sure you want to delete role "${selectedRole?.name}"?`,
						initial: false,
					})

					if (!confirmResponse.confirm) {
						console.log('\n❌ Operation cancelled\n')
						continue
					}

					await prisma.role.delete({
						where: { id: selectedRoleId },
					})

					console.log(`\n✅ Deleted role: ${selectedRole?.name}\n`)
					continue
				}
			}

			// 4. Get role data
			let existingRole: (typeof existingRoles)[0] | undefined
			if (action === 'update' && selectedRoleId) {
				existingRole = existingRoles.find(r => r.id === selectedRoleId)
			}

			// 5. Interactive prompts for name and description
			const dataResponse = await prompts([
				{
					type: 'text',
					name: 'name',
					message: 'Enter role name:',
					initial: existingRole?.name,
					validate: (value: string) => {
						if (!value || value.trim().length === 0) {
							return 'Role name is required'
						}
						return true
					},
				},
				{
					type: 'text',
					name: 'description',
					message: 'Enter role description (optional):',
					initial: existingRole?.description || '',
				},
			])

			if (!dataResponse.name) {
				console.log('\n❌ Operation cancelled\n')
				continue
			}

			const name = dataResponse.name.trim()
			const description = dataResponse.description?.trim() || null

			// 6. Check for duplicates
			const duplicateByName = existingRoles.find(
				r => r.id !== selectedRoleId && r.name.toLowerCase() === name.toLowerCase(),
			)

			if (duplicateByName) {
				console.log(`\n❌ Role with name "${name}" already exists\n`)
				continue
			}

			// 7. Permission assignment (only for update)
			let selectedPermissionIds: string[] = existingRole?.permissions.map(p => p.id) || []

			if (action === 'update' && allPermissions.length > 0) {
				const permissionResponse = await prompts({
					type: 'multiselect',
					name: 'permissions',
					message: 'Select permissions for this role:',
					choices: allPermissions.map(p => ({
						title: `${p.action}:${p.entity}:${p.access}`,
						description: p.description || '',
						value: p.id,
						selected: selectedPermissionIds.includes(p.id),
					})),
					hint: '- Space to select, Enter to confirm',
				})

				if (permissionResponse.permissions) {
					selectedPermissionIds = permissionResponse.permissions
				}
			}

			// 8. Create or update role
			if (action === 'update' && selectedRoleId) {
				console.log('\n📝 Updating role...')

				const role = await prisma.role.update({
					where: { id: selectedRoleId },
					data: {
						name,
						description,
						permissions: {
							set: selectedPermissionIds.map(id => ({ id })),
						},
					},
				})

				console.log(`✅ Updated role: ${role.name}\n`)
			} else {
				console.log('\n📝 Creating new role...')

				const role = await prisma.role.create({
					data: {
						name,
						description,
					},
				})

				console.log(`✅ Created role: ${role.name}\n`)
			}
		} catch (error) {
			console.error('❌ Error:', error)
			console.log('')
		}
	}
}

manageRole()
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
