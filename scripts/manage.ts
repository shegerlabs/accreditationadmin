// manage.ts
// Main entry point for all management scripts
//
// USAGE:
//   npm run manage
//   OR
//   npx tsx prisma/manage.ts
//
// FEATURES:
//   - Single entry point for all management tasks
//   - Interactive menu selection
//   - Easy to remember - just run `npm run manage`

import { PrismaClient } from '@prisma/client'
import prompts from 'prompts'
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const prisma = new PrismaClient()
const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface MenuOption {
	title: string
	description: string
	value: string
	script: string
}

const menuOptions: MenuOption[] = [
	{
		title: '👤 Manage Users',
		description: 'Create, list, delete users and change passwords',
		value: 'user',
		script: 'scripts/manage-user.ts',
	},
	{
		title: '🔑 Manage Roles',
		description: 'Create, update, delete roles and assign permissions',
		value: 'role',
		script: 'scripts/manage-role.ts',
	},
	{
		title: '🔐 Manage Permissions',
		description: 'Create, update, delete permissions and assign to roles',
		value: 'permission',
		script: 'scripts/manage-permission.ts',
	},
	{
		title: '🌍 Manage Countries',
		description: 'Create and update countries',
		value: 'country',
		script: 'scripts/manage-country.ts',
	},
	{
		title: '🏷️  Manage Titles',
		description: 'Create, update, delete titles (Mr., Mrs., Dr., etc.)',
		value: 'title',
		script: 'scripts/manage-title.ts',
	},
	{
		title: '📅 Manage Meeting Types',
		description: 'Create, update, delete meeting types for a tenant',
		value: 'meeting-type',
		script: 'scripts/manage-meeting-type.ts',
	},
	{
		title: '👥 Manage Participant Types',
		description: 'Create, update, delete participant types with quotas and flags',
		value: 'participant-type',
		script: 'scripts/manage-participant-type.ts',
	},
	{
		title: '🚀 Manage Workflows',
		description: 'Create and update approval workflows for events',
		value: 'workflow',
		script: 'scripts/manage-workflow.ts',
	},
	{
		title: '🔄 Reset Password',
		description: 'Reset a user password',
		value: 'reset-password',
		script: 'scripts/reset-password.ts',
	},
]

async function showStats() {
	try {
		const [users, roles, permissions, countries, tenants, events, participants] =
			await Promise.all([
				prisma.user.count(),
				prisma.role.count(),
				prisma.permission.count(),
				prisma.country.count(),
				prisma.tenant.count(),
				prisma.event.count(),
				prisma.participant.count(),
			])

		console.log('\n📊 Database Statistics:')
		console.log('─'.repeat(40))
		console.log(`  👤 Users:        ${users}`)
		console.log(`  🔑 Roles:        ${roles}`)
		console.log(`  🔐 Permissions:  ${permissions}`)
		console.log(`  🌍 Countries:    ${countries}`)
		console.log(`  🏢 Tenants:      ${tenants}`)
		console.log(`  📅 Events:       ${events}`)
		console.log(`  👥 Participants: ${participants}`)
		console.log('─'.repeat(40))
	} catch (error) {
		// Silently ignore stats errors
	}
}

async function runScript(scriptPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const fullPath = path.join(__dirname, '..', scriptPath)
		const isTypeScript = scriptPath.endsWith('.ts')
		const isJavaScript = scriptPath.endsWith('.js')

		let command: string
		let args: string[]

		if (isTypeScript) {
			command = 'npx'
			args = ['tsx', fullPath]
		} else if (isJavaScript) {
			command = 'node'
			args = [fullPath]
		} else {
			reject(new Error(`Unknown script type: ${scriptPath}`))
			return
		}

		console.log('\n' + '═'.repeat(50))
		console.log('💡 Press Ctrl+C at any time to return to main menu')
		console.log('═'.repeat(50))
		console.log('')

		const child = spawn(command, args, {
			stdio: 'inherit',
			cwd: path.join(__dirname, '..'),
		})

		child.on('close', code => {
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`Script exited with code ${code}`))
			}
		})

		child.on('error', error => {
			reject(error)
		})
	})
}

async function main() {
	console.clear()
	console.log('╔════════════════════════════════════════════════════╗')
	console.log('║                                                    ║')
	console.log('║    🛠️  Accreditation Admin Management Console      ║')
	console.log('║                                                    ║')
	console.log('╚════════════════════════════════════════════════════╝')

	await showStats()

	let continueLoop = true

	while (continueLoop) {
		console.log('')

		const response = await prompts({
			type: 'select',
			name: 'action',
			message: 'What would you like to manage?',
			choices: [
				...menuOptions.map(opt => ({
					title: opt.title,
					description: opt.description,
					value: opt.value,
				})),
				{ title: '─'.repeat(30), value: 'separator', disabled: true },
				{ title: '📊 Show Statistics', description: 'Display database counts', value: 'stats' },
				{ title: '❌ Exit', description: 'Exit the management console', value: 'exit' },
			],
		})

		if (!response.action || response.action === 'exit') {
			console.log('\n👋 Goodbye!\n')
			continueLoop = false
			break
		}

		if (response.action === 'stats') {
			await showStats()
			continue
		}

		const selectedOption = menuOptions.find(opt => opt.value === response.action)

		if (selectedOption) {
			try {
				await runScript(selectedOption.script)
			} catch (error) {
				// Script was cancelled or errored - just return to menu
			}

			// Return to main menu
			console.log('\n')
			console.log('╔════════════════════════════════════════════════════╗')
			console.log('║                                                    ║')
			console.log('║    🛠️  Accreditation Admin Management Console      ║')
			console.log('║                                                    ║')
			console.log('╚════════════════════════════════════════════════════╝')
			await showStats()
		}
	}
}

main()
	.catch(error => {
		console.error('❌ Fatal error:', error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
