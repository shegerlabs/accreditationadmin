#!/usr/bin/env node

import { PrismaClient, UserStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'
import chalk from 'chalk'
import { Command } from 'commander'

const prisma = new PrismaClient()
const program = new Command()

program
	.name('manage-user')
	.description('Manage users for the accreditation system')
	.version('1.0.0')

program
	.command('create')
	.description('Create a single user')
	.requiredOption('-u, --username <username>', 'Username for the user')
	.requiredOption('-e, --email <email>', 'Email address')
	.requiredOption('-n, --name <name>', 'Full name')
	.requiredOption('-p, --password <password>', 'Password')
	.option(
		'-r, --role <role>',
		'Role (user, focal, admin, tenant, reviewer, first-validator, second-validator, printer)',
		'user',
	)
	.option('-s, --status <status>', 'User status (active, inactive)', 'inactive')
	.option('-t, --tenant <tenantId>', 'Tenant ID (required for non-admin users)')
	.action(async options => {
		try {
			// Validate tenant requirement for non-admin users
			if (options.role !== 'admin' && !options.tenant) {
				console.error(chalk.red('❌ Tenant ID is required for non-admin users'))
				process.exit(1)
			}

			// Check if user already exists
			const existingUser = await prisma.user.findUnique({
				where: { username: options.username },
			})

			if (existingUser) {
				console.log(
					chalk.yellow(
						`⚠️  User with username "${options.username}" already exists`,
					),
				)
				const update = await prisma.user.update({
					where: { username: options.username },
					data: {
						email: options.email,
						name: options.name,
						status:
							options.status.toUpperCase() === 'ACTIVE'
								? UserStatus.ACTIVE
								: UserStatus.INACTIVE,
						roles: {
							set: [],
							connect: [{ name: options.role }],
						},
						password: {
							delete: {},
							create: {
								hash: bcrypt.hashSync(options.password, 10),
							},
						},
					},
				})
				console.log(chalk.green(`✅ Updated user: ${update.username}`))
			} else {
				const user = await prisma.user.create({
					data: {
						username: options.username,
						email: options.email,
						name: options.name,
						status:
							options.status.toUpperCase() === 'ACTIVE'
								? UserStatus.ACTIVE
								: UserStatus.INACTIVE,
						tenantId: options.tenant,
						roles: {
							connect: [{ name: options.role }],
						},
						password: {
							create: {
								hash: bcrypt.hashSync(options.password, 10),
							},
						},
					},
				})
				console.log(chalk.green(`✅ Created user: ${user.username}`))
			}
		} catch (error) {
			console.error(chalk.red(`❌ Error creating user: ${error instanceof Error ? error.message : error}`))
			process.exit(1)
		} finally {
			await prisma.$disconnect()
		}
	})

program
	.command('list')
	.description('List all users')
	.option('-r, --role <role>', 'Filter by role')
	.option('-s, --status <status>', 'Filter by status')
	.action(async options => {
		try {
			const where: {
				roles?: { some: { name: string } }
				status?: UserStatus
			} = {}

			if (options.role) {
				where.roles = {
					some: {
						name: options.role,
					},
				}
			}

			if (options.status) {
				where.status = options.status.toUpperCase() as UserStatus
			}

			const users = await prisma.user.findMany({
				where,
				include: {
					roles: true,
					tenant: true,
				},
				orderBy: {
					username: 'asc',
				},
			})

			console.log(chalk.blue(`\n📋 Found ${users.length} users:\n`))

			users.forEach(user => {
				const statusColor = user.status === 'ACTIVE' ? chalk.green : chalk.red
				const roles = user.roles.map(r => r.name).join(', ')
				console.log(`${chalk.bold(user.username)} (${user.email})`)
				console.log(`  Name: ${user.name}`)
				console.log(`  Status: ${statusColor(user.status)}`)
				console.log(`  Roles: ${chalk.cyan(roles)}`)
				if (user.tenant) {
					console.log(`  Tenant: ${user.tenant.name}`)
				}
				console.log('')
			})
		} catch (error) {
			console.error(chalk.red(`❌ Error listing users: ${error instanceof Error ? error.message : error}`))
			process.exit(1)
		} finally {
			await prisma.$disconnect()
		}
	})

program
	.command('delete')
	.description('Delete a user')
	.requiredOption('-u, --username <username>', 'Username to delete')
	.action(async options => {
		try {
			const user = await prisma.user.findUnique({
				where: { username: options.username },
			})

			if (!user) {
				console.error(chalk.red(`❌ User "${options.username}" not found`))
				process.exit(1)
			}

			// Delete password first (due to foreign key constraint)
			await prisma.password.deleteMany({
				where: { userId: user.id },
			})

			// Delete user
			await prisma.user.delete({
				where: { username: options.username },
			})

			console.log(chalk.green(`✅ Deleted user: ${options.username}`))
		} catch (error) {
			console.error(chalk.red(`❌ Error deleting user: ${error instanceof Error ? error.message : error}`))
			process.exit(1)
		} finally {
			await prisma.$disconnect()
		}
	})

program
	.command('change-password')
	.description("Change a user's password")
	.requiredOption('-u, --username <username>', 'Username')
	.requiredOption('-p, --password <password>', 'New password')
	.action(async options => {
		try {
			const user = await prisma.user.findUnique({
				where: { username: options.username },
			})

			if (!user) {
				console.error(chalk.red(`❌ User "${options.username}" not found`))
				process.exit(1)
			}

			// Delete existing password and create new one
			await prisma.password.deleteMany({
				where: { userId: user.id },
			})

			await prisma.password.create({
				data: {
					userId: user.id,
					hash: bcrypt.hashSync(options.password, 10),
				},
			})

			console.log(
				chalk.green(`✅ Password changed for user: ${options.username}`),
			)
		} catch (error) {
			console.error(chalk.red(`❌ Error changing password: ${error instanceof Error ? error.message : error}`))
			process.exit(1)
		} finally {
			await prisma.$disconnect()
		}
	})

program
	.command('bulk')
	.description('Create multiple users from a JSON file')
	.requiredOption('-f, --file <file>', 'JSON file with user data')
	.action(async options => {
		try {
			const fs = await import('fs')
			const path = await import('path')

			const filePath = path.resolve(options.file)

			if (!fs.existsSync(filePath)) {
				console.error(chalk.red(`❌ File not found: ${filePath}`))
				process.exit(1)
			}

			const userData = JSON.parse(fs.readFileSync(filePath, 'utf8'))

			if (!Array.isArray(userData)) {
				console.error(
					chalk.red('❌ JSON file must contain an array of user objects'),
				)
				process.exit(1)
			}

			console.log(chalk.blue(`📝 Creating ${userData.length} users...\n`))

			for (const user of userData) {
				try {
					// Validate required fields
					if (!user.username || !user.email || !user.name || !user.password) {
						console.log(
							chalk.yellow(`⚠️  Skipping user: missing required fields`),
						)
						continue
					}

					// Check if user exists
					const existingUser = await prisma.user.findUnique({
						where: { username: user.username },
					})

					if (existingUser) {
						console.log(
							chalk.yellow(
								`⚠️  User "${user.username}" already exists, skipping`,
							),
						)
						continue
					}

					const createdUser = await prisma.user.create({
						data: {
							username: user.username,
							email: user.email,
							name: user.name,
							status:
								(user.status || 'inactive').toUpperCase() === 'ACTIVE'
									? UserStatus.ACTIVE
									: UserStatus.INACTIVE,
							tenantId: user.tenantId,
							roles: {
								connect: [{ name: user.role || 'user' }],
							},
							password: {
								create: {
									hash: bcrypt.hashSync(user.password, 10),
								},
							},
						},
					})

					console.log(chalk.green(`✅ Created: ${createdUser.username}`))
				} catch (error) {
					console.log(chalk.red(`❌ Failed to create user: ${error instanceof Error ? error.message : error}`))
				}
			}

			console.log(chalk.blue('\n🎉 Bulk user creation completed!'))
		} catch (error) {
			console.error(chalk.red(`❌ Error in bulk creation: ${error instanceof Error ? error.message : error}`))
			process.exit(1)
		} finally {
			await prisma.$disconnect()
		}
	})

program
	.command('bulk-change-password')
	.description('Change passwords for multiple users from a JSON file')
	.requiredOption('-f, --file <file>', 'JSON file with password change data')
	.action(async options => {
		try {
			const fs = await import('fs')
			const path = await import('path')

			const filePath = path.resolve(options.file)

			if (!fs.existsSync(filePath)) {
				console.error(chalk.red(`❌ File not found: ${filePath}`))
				process.exit(1)
			}

			const passwordData = JSON.parse(fs.readFileSync(filePath, 'utf8'))

			if (!Array.isArray(passwordData)) {
				console.error(
					chalk.red(
						'❌ JSON file must contain an array of password change objects',
					),
				)
				process.exit(1)
			}

			console.log(
				chalk.blue(
					`🔐 Changing passwords for ${passwordData.length} users...\n`,
				),
			)

			let successCount = 0
			let errorCount = 0

			for (const item of passwordData) {
				try {
					// Validate required fields
					if (!item.username || !item.password) {
						console.log(
							chalk.yellow(`⚠️  Skipping item: missing username or password`),
						)
						errorCount++
						continue
					}

					// Check if user exists
					const user = await prisma.user.findUnique({
						where: { username: item.username },
					})

					if (!user) {
						console.log(
							chalk.red(`❌ User "${item.username}" not found, skipping`),
						)
						errorCount++
						continue
					}

					// Delete existing password and create new one
					await prisma.password.deleteMany({
						where: { userId: user.id },
					})

					await prisma.password.create({
						data: {
							userId: user.id,
							hash: bcrypt.hashSync(item.password, 10),
						},
					})

					console.log(chalk.green(`✅ Password changed: ${item.username}`))
					successCount++
				} catch (error) {
					console.log(
						chalk.red(
							`❌ Failed to change password for "${item.username}": ${error instanceof Error ? error.message : error}`,
						),
					)
					errorCount++
				}
			}

			console.log(chalk.blue(`\n📊 Bulk password change completed!`))
			console.log(
				chalk.green(`✅ Successfully changed: ${successCount} passwords`),
			)
			if (errorCount > 0) {
				console.log(chalk.red(`❌ Failed: ${errorCount} passwords`))
			}
		} catch (error) {
			console.error(
				chalk.red(`❌ Error in bulk password change: ${error instanceof Error ? error.message : error}`),
			)
			process.exit(1)
		} finally {
			await prisma.$disconnect()
		}
	})

program.parse()
