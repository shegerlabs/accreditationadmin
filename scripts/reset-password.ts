// reset-password.ts
// Interactive script to reset a user's password
//
// USAGE:
//   npm run reset-password
//   OR
//   npx tsx prisma/reset-password.ts
//
// FEATURES:
//   - Lists all users in the database
//   - Allows selecting a user by email or username
//   - Prompts for a new password
//   - Hashes the password securely using bcrypt
//   - Updates or creates the password record
//
// NOTES:
//   - This script is safe to run multiple times
//   - Passwords are hashed with bcrypt (salt rounds: 10)
//   - The password will be updated if it exists, or created if it doesn't

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import prompts from 'prompts'

const prisma = new PrismaClient()

async function resetPassword() {
	console.log('🔐 Interactive Password Reset Tool\n')
	console.log("This tool helps you reset any user's password.\n")

	try {
		// 1. Fetch all existing users
		const existingUsers = await prisma.user.findMany({
			orderBy: { email: 'asc' },
			select: {
				id: true,
				email: true,
				username: true,
				name: true,
				status: true,
			},
		})

		if (existingUsers.length === 0) {
			console.log('❌ No users found in the database.')
			return
		}

		// 2. Select user
		const userResponse = await prompts({
			type: 'select',
			name: 'userId',
			message: 'Select the user to reset password for:',
			choices: existingUsers.map(user => ({
				title: `${user.email} (${user.username})${user.name ? ` - ${user.name}` : ''} [${user.status}]`,
				value: user.id,
			})),
		})

		if (!userResponse.userId) {
			console.log('\n❌ Operation cancelled')
			return
		}

		const selectedUser = existingUsers.find(u => u.id === userResponse.userId)
		if (!selectedUser) {
			throw new Error('Selected user not found')
		}

		console.log(
			`\n📧 Selected user: ${selectedUser.email} (${selectedUser.username})`,
		)

		// 3. Get new password
		const passwordResponse = await prompts({
			type: 'password',
			name: 'password',
			message: 'Enter new password:',
			validate: (value: string) => {
				if (!value || value.trim().length === 0) {
					return 'Password is required'
				}
				if (value.length < 8) {
					return 'Password must be at least 8 characters long'
				}
				return true
			},
		})

		// Handle user cancellation (Ctrl+C)
		if (!passwordResponse.password) {
			console.log('\n❌ Operation cancelled')
			return
		}

		const newPassword = passwordResponse.password

		// 4. Confirm password
		const confirmResponse = await prompts({
			type: 'password',
			name: 'confirmPassword',
			message: 'Confirm new password:',
			validate: (value: string) => {
				if (!value || value.trim().length === 0) {
					return 'Password confirmation is required'
				}
				if (value !== newPassword) {
					return 'Passwords do not match'
				}
				return true
			},
		})

		// Handle user cancellation (Ctrl+C)
		if (!confirmResponse.confirmPassword) {
			console.log('\n❌ Operation cancelled')
			return
		}

		// 5. Hash the password
		console.log('\n🔒 Hashing password...')
		const hashedPassword = await bcrypt.hash(newPassword, 10)

		// 6. Check if password record exists
		const existingPassword = await prisma.password.findUnique({
			where: { userId: selectedUser.id },
		})

		// 7. Update or create password
		if (existingPassword) {
			console.log('📝 Updating existing password...')
			await prisma.password.update({
				where: { userId: selectedUser.id },
				data: {
					hash: hashedPassword,
				},
			})
			console.log(`✅ Password updated successfully for ${selectedUser.email}`)
		} else {
			console.log('📝 Creating new password record...')
			await prisma.password.create({
				data: {
					userId: selectedUser.id,
					hash: hashedPassword,
				},
			})
			console.log(`✅ Password created successfully for ${selectedUser.email}`)
		}

		console.log('\n🎉 Password reset completed successfully!')
	} catch (error) {
		console.error('❌ Error resetting password:', error)
		throw error
	}
}

resetPassword()
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
