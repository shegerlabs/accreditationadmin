// manage-user.ts
// Interactive script to create or update users
//
// USAGE:
//   npm run manage-user
//   OR
//   npx tsx prisma/manage-user.ts
//
// FEATURES:
//   - Create new users
//   - Update existing users
//   - Delete users
//   - List all users
//   - Change passwords
//   - Prevents duplicate users (by username/email)
//
// NOTES:
//   - This script is idempotent (safe to run multiple times)
//   - Will update existing users instead of creating duplicates

import { PrismaClient, UserStatus } from '@prisma/client'
import prompts from 'prompts'
import bcrypt from 'bcryptjs'
import { printTable } from './utils/table.js'

const prisma = new PrismaClient()

async function manageUser() {
	console.log('👤 Interactive User Manager\n')
	console.log('This tool helps you create or update users.\n')

	let continueLoop = true

	while (continueLoop) {
		try {
			// 1. Fetch all existing users
			const existingUsers = await prisma.user.findMany({
				orderBy: { username: 'asc' },
				include: { roles: true, tenant: true },
			})

			// 2. Fetch all roles for assignment
			const allRoles = await prisma.role.findMany({
				orderBy: { name: 'asc' },
			})

			// 3. Fetch all tenants
			const allTenants = await prisma.tenant.findMany({
				orderBy: { name: 'asc' },
			})

			// 4. Determine action
			const actionResponse = await prompts({
				type: 'select',
				name: 'action',
				message: 'What would you like to do?',
				choices: [
					{ title: 'Create a new user', value: 'create' },
					{ title: 'Update an existing user', value: 'update' },
					{ title: 'Delete a user', value: 'delete' },
					{ title: 'List all users', value: 'list' },
					{ title: 'Change password', value: 'change-password' },
					{ title: 'Unlock a locked user', value: 'unlock' },
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
				console.log('\n📋 Existing Users:\n')
				printTable(
					[
						{ header: 'Username', key: 'username', width: 20 },
						{ header: 'Name', key: 'name', width: 25 },
						{ header: 'Email', key: 'email', width: 30 },
						{ header: 'Status', key: 'status', width: 10 },
						{ header: 'Roles', key: 'roles', width: 25 },
					],
					existingUsers.map(u => ({
						username: u.username,
						name: u.name || '-',
						email: u.email,
						status: u.status,
						roles: u.roles.map(r => r.name).join(', ') || '-',
					})),
				)
				console.log(`Total: ${existingUsers.length} users\n`)
				continue
			}

			// Handle unlock
			//
			// The admin UI (admin/users/$userId, intent 'unlock-user') can already do
			// this, but it requires being logged in as an admin. When the only admin
			// account is itself locked there is no way in — this CLI is the recovery
			// path. Keep the reset fields identical to that route.
			if (action === 'unlock') {
				const lockedUsers = await prisma.user.findMany({
					where: {
						OR: [
							{ status: UserStatus.LOCKED },
							{ lockCount: { gt: 0 } },
							{ failedLoginAttempts: { gt: 0 } },
						],
					},
					orderBy: { username: 'asc' },
					select: {
						id: true,
						username: true,
						status: true,
						lockCount: true,
						failedLoginAttempts: true,
						lockedAt: true,
						lockReason: true,
						autoUnlockAt: true,
					},
				})

				if (lockedUsers.length === 0) {
					console.log('\n✅ No locked users.\n')
					continue
				}

				console.log('\n🔒 Locked / flagged users:\n')
				printTable(
					[
						{ header: 'Username', key: 'username', width: 20 },
						{ header: 'Status', key: 'status', width: 10 },
						{ header: 'Locks', key: 'lockCount', width: 7 },
						{ header: 'Failed', key: 'failed', width: 8 },
						{ header: 'Auto-unlock', key: 'autoUnlock', width: 22 },
					],
					lockedUsers.map(u => ({
						username: u.username,
						status: u.status,
						lockCount: String(u.lockCount),
						failed: String(u.failedLoginAttempts),
						autoUnlock: u.autoUnlockAt
							? u.autoUnlockAt.toISOString()
							: u.status === UserStatus.LOCKED
								? 'never (permanent)'
								: '-',
					})),
				)

				const pick = await prompts({
					type: 'select',
					name: 'userId',
					message: 'Select a user to unlock:',
					choices: lockedUsers.map(u => ({
						title: `${u.username} (${u.status}, ${u.lockCount} lock(s))`,
						value: u.id,
					})),
				})

				if (!pick.userId) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				const targetUser = lockedUsers.find(u => u.id === pick.userId)!

				const confirmUnlock = await prompts({
					type: 'confirm',
					name: 'ok',
					message: `Unlock "${targetUser.username}"? This resets the lock counter to 0.`,
					initial: false,
				})

				if (!confirmUnlock.ok) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				// Same fields as the 'unlock-user' intent in the admin UI. Resetting
				// lockCount matters: leaving it at or above auth.maxLockCount means the
				// next lockout is immediately permanent with no auto-unlock.
				await prisma.user.update({
					where: { id: targetUser.id },
					data: {
						status: UserStatus.ACTIVE,
						failedLoginAttempts: 0,
						lockedAt: null,
						lockReason: null,
						autoUnlockAt: null,
						lockCount: 0,
					},
				})

				console.log(`\n✅ Unlocked: ${targetUser.username}\n`)
				continue
			}

			// Handle change-password
			if (action === 'change-password') {
				if (existingUsers.length === 0) {
					console.log('\n❌ No users found\n')
					continue
				}

				const userResponse = await prompts({
					type: 'select',
					name: 'userId',
					message: 'Select user to change password:',
					choices: existingUsers.map(user => ({
						title: `${user.username} - ${user.name || user.email}`,
						value: user.id,
					})),
				})

				if (!userResponse.userId) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				const passwordResponse = await prompts({
					type: 'password',
					name: 'password',
					message: 'Enter new password:',
					validate: (value: string) => {
						if (!value || value.length < 6) {
							return 'Password must be at least 6 characters'
						}
						return true
					},
				})

				if (!passwordResponse.password) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				// Delete existing password and create new one
				await prisma.password.deleteMany({
					where: { userId: userResponse.userId },
				})

				await prisma.password.create({
					data: {
						userId: userResponse.userId,
						hash: bcrypt.hashSync(passwordResponse.password, 10),
					},
				})

				const selectedUser = existingUsers.find(
					u => u.id === userResponse.userId,
				)
				console.log(`\n✅ Password changed for: ${selectedUser?.username}\n`)
				continue
			}

			let selectedUserId: string | undefined

			// Handle update/delete - select user
			if (action === 'update' || action === 'delete') {
				if (existingUsers.length === 0) {
					console.log('\n❌ No users found\n')
					continue
				}

				const userResponse = await prompts({
					type: 'select',
					name: 'userId',
					message: `Select the user to ${action}:`,
					choices: existingUsers.map(user => ({
						title: `${user.username} - ${user.name || user.email}`,
						description: user.roles.map(r => r.name).join(', '),
						value: user.id,
					})),
				})

				if (!userResponse.userId) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				selectedUserId = userResponse.userId

				// Handle delete
				if (action === 'delete') {
					const selectedUser = existingUsers.find(u => u.id === selectedUserId)
					const confirmResponse = await prompts({
						type: 'confirm',
						name: 'confirm',
						message: `Are you sure you want to delete user "${selectedUser?.username}"?`,
						initial: false,
					})

					if (!confirmResponse.confirm) {
						console.log('\n❌ Operation cancelled\n')
						continue
					}

					// Delete password first (due to foreign key constraint)
					await prisma.password.deleteMany({
						where: { userId: selectedUserId },
					})

					await prisma.user.delete({
						where: { id: selectedUserId },
					})

					console.log(`\n✅ Deleted user: ${selectedUser?.username}\n`)
					continue
				}
			}

			// 5. Get user data
			let existingUser: (typeof existingUsers)[0] | undefined
			if (action === 'update' && selectedUserId) {
				existingUser = existingUsers.find(u => u.id === selectedUserId)
			}

			// 6. Interactive prompts for user data
			const dataResponse = await prompts([
				{
					type: 'text',
					name: 'username',
					message: 'Enter username:',
					initial: existingUser?.username,
					validate: (value: string) => {
						if (!value || value.trim().length === 0) {
							return 'Username is required'
						}
						return true
					},
				},
				{
					type: 'text',
					name: 'email',
					message: 'Enter email:',
					initial: existingUser?.email,
					validate: (value: string) => {
						if (!value || !value.includes('@')) {
							return 'Valid email is required'
						}
						return true
					},
				},
				{
					type: 'text',
					name: 'name',
					message: 'Enter full name:',
					initial: existingUser?.name || '',
				},
				{
					type: 'select',
					name: 'status',
					message: 'Select status:',
					choices: [
						{ title: 'ACTIVE', value: UserStatus.ACTIVE },
						{ title: 'INACTIVE', value: UserStatus.INACTIVE },
						{ title: 'LOCKED', value: UserStatus.LOCKED },
					],
					initial: existingUser
						? Object.values(UserStatus).indexOf(existingUser.status)
						: 0,
				},
			])

			if (!dataResponse.username || !dataResponse.email) {
				console.log('\n❌ Operation cancelled\n')
				continue
			}

			const username = dataResponse.username.trim()
			const email = dataResponse.email.trim().toLowerCase()
			const name = dataResponse.name?.trim() || null
			const status = dataResponse.status

			// 7. Check for duplicates
			const duplicateUsername = existingUsers.find(
				u =>
					u.id !== selectedUserId &&
					u.username.toLowerCase() === username.toLowerCase(),
			)
			if (duplicateUsername) {
				console.log(`\n❌ Username "${username}" already exists\n`)
				continue
			}

			const duplicateEmail = existingUsers.find(
				u =>
					u.id !== selectedUserId &&
					u.email.toLowerCase() === email.toLowerCase(),
			)
			if (duplicateEmail) {
				console.log(`\n❌ Email "${email}" already exists\n`)
				continue
			}

			// 8. Tenant selection (optional)
			let tenantId: string | null = existingUser?.tenantId || null

			if (allTenants.length > 0) {
				const tenantResponse = await prompts({
					type: 'select',
					name: 'tenantId',
					message: 'Select tenant (optional):',
					choices: [
						{ title: 'No tenant', value: null },
						...allTenants.map(t => ({
							title: t.name,
							description: t.email,
							value: t.id,
						})),
					],
					initial: existingUser?.tenantId
						? allTenants.findIndex(t => t.id === existingUser.tenantId) + 1
						: 0,
				})

				tenantId = tenantResponse.tenantId
			}

			// 9. Role assignment
			let selectedRoleIds: string[] = existingUser?.roles.map(r => r.id) || []

			if (allRoles.length > 0) {
				const roleResponse = await prompts({
					type: 'multiselect',
					name: 'roles',
					message: 'Select roles for this user:',
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

			// 10. Password (only for create)
			let passwordHash: string | undefined

			if (action === 'create') {
				const passwordResponse = await prompts({
					type: 'password',
					name: 'password',
					message: 'Enter password:',
					validate: (value: string) => {
						if (!value || value.length < 6) {
							return 'Password must be at least 6 characters'
						}
						return true
					},
				})

				if (!passwordResponse.password) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				passwordHash = bcrypt.hashSync(passwordResponse.password, 10)
			}

			// 11. Create or update user
			if (action === 'update' && selectedUserId) {
				console.log('\n📝 Updating user...')

				const user = await prisma.user.update({
					where: { id: selectedUserId },
					data: {
						username,
						email,
						name,
						status,
						tenantId,
						roles: {
							set: selectedRoleIds.map(id => ({ id })),
						},
					},
				})

				console.log(`✅ Updated user: ${user.username}\n`)
			} else {
				console.log('\n📝 Creating new user...')

				const user = await prisma.user.create({
					data: {
						username,
						email,
						name,
						status,
						tenantId,
						roles: {
							connect: selectedRoleIds.map(id => ({ id })),
						},
						password: passwordHash
							? {
									create: {
										hash: passwordHash,
									},
								}
							: undefined,
					},
				})

				console.log(`✅ Created user: ${user.username}\n`)
			}
		} catch (error) {
			console.error('❌ Error:', error)
			console.log('')
		}
	}
}

manageUser()
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
