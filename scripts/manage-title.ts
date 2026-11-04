// manage-title.ts
// Interactive script to create or update titles
//
// USAGE:
//   npm run manage-title
//   OR
//   npx tsx scripts/manage-title.ts
//
// FEATURES:
//   - Create new titles
//   - Update existing titles
//   - Delete titles
//   - List all titles
//   - Prevents duplicate titles (by name)
//
// NOTES:
//   - This script is idempotent (safe to run multiple times)
//   - Will update existing titles instead of creating duplicates

import { PrismaClient } from '@prisma/client'
import prompts from 'prompts'
import { printTable } from './utils/table.js'

const prisma = new PrismaClient()

async function manageTitle() {
	console.log('🏷️  Interactive Title Manager\n')
	console.log('This tool helps you create or update titles.\n')

	let continueLoop = true

	while (continueLoop) {
		try {
			// 1. Fetch all existing titles
			const existingTitles = await prisma.title.findMany({
				orderBy: { name: 'asc' },
				include: {
					_count: {
						select: { participants: true },
					},
				},
			})

			// 2. Determine action
			const actionResponse = await prompts({
				type: 'select',
				name: 'action',
				message: 'What would you like to do?',
				choices: [
					{ title: 'Create a new title', value: 'create' },
					{ title: 'Update an existing title', value: 'update' },
					{ title: 'Delete a title', value: 'delete' },
					{ title: 'List all titles', value: 'list' },
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
				console.log('\n📋 Existing Titles:\n')
				printTable(
					[
						{ header: 'Name', key: 'name', width: 30 },
						{ header: 'Participants', key: 'participants', width: 15 },
					],
					existingTitles.map(t => ({
						name: t.name,
						participants: String(t._count.participants),
					})),
				)
				console.log(`Total: ${existingTitles.length} titles\n`)
				continue
			}

			let selectedTitleId: string | undefined

			// Handle update/delete - select title
			if (action === 'update' || action === 'delete') {
				if (existingTitles.length === 0) {
					console.log('\n❌ No titles found\n')
					continue
				}

				const titleResponse = await prompts({
					type: 'select',
					name: 'titleId',
					message: `Select the title to ${action}:`,
					choices: existingTitles.map(title => ({
						title: `${title.name} (${title._count.participants} participants)`,
						value: title.id,
					})),
				})

				if (!titleResponse.titleId) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				selectedTitleId = titleResponse.titleId

				// Handle delete
				if (action === 'delete') {
					const selectedTitle = existingTitles.find(t => t.id === selectedTitleId)

					// Check if title has participants
					if (selectedTitle && selectedTitle._count.participants > 0) {
						const forceDelete = await prompts({
							type: 'confirm',
							name: 'confirm',
							message: `This title has ${selectedTitle._count.participants} participant(s). Deleting will remove the title from these participants. Continue?`,
							initial: false,
						})

						if (!forceDelete.confirm) {
							console.log('\n❌ Operation cancelled\n')
							continue
						}
					}

					const confirmResponse = await prompts({
						type: 'confirm',
						name: 'confirm',
						message: `Are you sure you want to delete title "${selectedTitle?.name}"?`,
						initial: false,
					})

					if (!confirmResponse.confirm) {
						console.log('\n❌ Operation cancelled\n')
						continue
					}

					await prisma.title.delete({
						where: { id: selectedTitleId },
					})

					console.log(`\n✅ Deleted title: ${selectedTitle?.name}\n`)
					continue
				}
			}

			// 3. Get title data to update (if updating)
			let existingTitle: (typeof existingTitles)[0] | undefined
			if (action === 'update' && selectedTitleId) {
				existingTitle = existingTitles.find(t => t.id === selectedTitleId)
			}

			// 4. Interactive prompts for name
			const dataResponse = await prompts([
				{
					type: 'text',
					name: 'name',
					message: 'Enter title name (e.g., Mr., Mrs., Dr., Prof.):',
					initial: existingTitle?.name,
					validate: (value: string) => {
						if (!value || value.trim().length === 0) {
							return 'Title name is required'
						}
						return true
					},
				},
			])

			// Handle user cancellation (Ctrl+C)
			if (!dataResponse.name) {
				console.log('\n❌ Operation cancelled\n')
				continue
			}

			const name = dataResponse.name.trim()

			// 5. Check for duplicates
			const duplicateByName = existingTitles.find(
				t =>
					t.id !== selectedTitleId &&
					t.name.toLowerCase() === name.toLowerCase(),
			)

			if (duplicateByName) {
				console.log(`\n❌ Title with name "${name}" already exists\n`)
				continue
			}

			// 6. Create or update title
			if (action === 'update' && selectedTitleId) {
				console.log('\n📝 Updating title...')

				const title = await prisma.title.update({
					where: { id: selectedTitleId },
					data: {
						name,
					},
				})

				console.log(`✅ Updated title: ${title.name}\n`)
			} else {
				console.log('\n📝 Creating new title...')

				const title = await prisma.title.create({
					data: {
						name,
					},
				})

				console.log(`✅ Created title: ${title.name}\n`)
			}
		} catch (error) {
			console.error('❌ Error:', error)
			console.log('')
		}
	}
}

manageTitle()
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
