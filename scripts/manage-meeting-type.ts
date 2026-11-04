// manage-meeting-type.ts
// Interactive script to create or update meeting types
//
// USAGE:
//   npm run manage-meeting-type
//   OR
//   npx tsx prisma/manage-meeting-type.ts
//
// FEATURES:
//   - Create new meeting types
//   - Update existing meeting types
//   - Delete meeting types
//   - List all meeting types
//   - Requires tenant selection
//   - Prevents duplicate meeting types (by tenant + name)
//
// NOTES:
//   - This script is idempotent (safe to run multiple times)
//   - Will update existing meeting types instead of creating duplicates

import { PrismaClient } from '@prisma/client'
import prompts from 'prompts'
import { printTable } from './utils/table.js'

const prisma = new PrismaClient()

async function manageMeetingType() {
	console.log('📅 Interactive Meeting Type Manager\n')
	console.log('This tool helps you create or update meeting types.\n')

	// 1. Fetch all tenants
	const tenants = await prisma.tenant.findMany({
		orderBy: { name: 'asc' },
	})

	if (tenants.length === 0) {
		console.log('❌ No tenants found. Please create a tenant first.')
		return
	}

	// 2. Select tenant
	const tenantResponse = await prompts({
		type: 'select',
		name: 'tenantId',
		message: 'Select the tenant:',
		choices: tenants.map(t => ({
			title: t.name,
			description: t.email,
			value: t.id,
		})),
	})

	if (!tenantResponse.tenantId) {
		console.log('\n❌ Operation cancelled')
		return
	}

	const selectedTenant = tenants.find(t => t.id === tenantResponse.tenantId)!
	let continueLoop = true

	while (continueLoop) {
		try {
			// 3. Fetch existing meeting types for this tenant
			const existingMeetingTypes = await prisma.meetingType.findMany({
				where: { tenantId: tenantResponse.tenantId },
				orderBy: { name: 'asc' },
			})

			// 4. Determine action
			const actionResponse = await prompts({
				type: 'select',
				name: 'action',
				message: 'What would you like to do?',
				choices: [
					{ title: 'Create a new meeting type', value: 'create' },
					{ title: 'Update an existing meeting type', value: 'update' },
					{ title: 'Delete a meeting type', value: 'delete' },
					{ title: 'List all meeting types', value: 'list' },
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
				console.log(`\n📋 Meeting Types for ${selectedTenant.name}:\n`)
				printTable(
					[
						{ header: 'Name', key: 'name', width: 25 },
						{ header: 'Description', key: 'description', width: 50 },
					],
					existingMeetingTypes.map(mt => ({
						name: mt.name,
						description: mt.description,
					})),
				)
				console.log(`Total: ${existingMeetingTypes.length} meeting types\n`)
				continue
			}

			let selectedMeetingTypeId: string | undefined

			// Handle update/delete - select meeting type
			if (action === 'update' || action === 'delete') {
				if (existingMeetingTypes.length === 0) {
					console.log('\n❌ No meeting types found for this tenant\n')
					continue
				}

				const mtResponse = await prompts({
					type: 'select',
					name: 'meetingTypeId',
					message: `Select the meeting type to ${action}:`,
					choices: existingMeetingTypes.map(mt => ({
						title: mt.name,
						description: mt.description,
						value: mt.id,
					})),
				})

				if (!mtResponse.meetingTypeId) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				selectedMeetingTypeId = mtResponse.meetingTypeId

				// Handle delete
				if (action === 'delete') {
					const selectedMt = existingMeetingTypes.find(
						mt => mt.id === selectedMeetingTypeId,
					)
					const confirmResponse = await prompts({
						type: 'confirm',
						name: 'confirm',
						message: `Are you sure you want to delete meeting type "${selectedMt?.name}"?`,
						initial: false,
					})

					if (!confirmResponse.confirm) {
						console.log('\n❌ Operation cancelled\n')
						continue
					}

					await prisma.meetingType.delete({
						where: { id: selectedMeetingTypeId },
					})

					console.log(`\n✅ Deleted meeting type: ${selectedMt?.name}\n`)
					continue
				}
			}

			// 5. Get meeting type data
			let existingMeetingType: (typeof existingMeetingTypes)[0] | undefined
			if (action === 'update' && selectedMeetingTypeId) {
				existingMeetingType = existingMeetingTypes.find(
					mt => mt.id === selectedMeetingTypeId,
				)
			}

			// 6. Interactive prompts
			const dataResponse = await prompts([
				{
					type: 'text',
					name: 'name',
					message: 'Enter meeting type name:',
					initial: existingMeetingType?.name,
					validate: (value: string) => {
						if (!value || value.trim().length === 0) {
							return 'Meeting type name is required'
						}
						return true
					},
				},
				{
					type: 'text',
					name: 'description',
					message: 'Enter description:',
					initial: existingMeetingType?.description,
					validate: (value: string) => {
						if (!value || value.trim().length === 0) {
							return 'Description is required'
						}
						return true
					},
				},
			])

			if (!dataResponse.name || !dataResponse.description) {
				console.log('\n❌ Operation cancelled\n')
				continue
			}

			const name = dataResponse.name.trim()
			const description = dataResponse.description.trim()

			// 7. Check for duplicates
			const duplicate = existingMeetingTypes.find(
				mt =>
					mt.id !== selectedMeetingTypeId &&
					mt.name.toLowerCase() === name.toLowerCase(),
			)

			if (duplicate) {
				console.log(`\n❌ Meeting type "${name}" already exists for this tenant\n`)
				continue
			}

			// 8. Create or update meeting type
			if (action === 'update' && selectedMeetingTypeId) {
				console.log('\n📝 Updating meeting type...')

				const meetingType = await prisma.meetingType.update({
					where: { id: selectedMeetingTypeId },
					data: {
						name,
						description,
					},
				})

				console.log(`✅ Updated meeting type: ${meetingType.name}\n`)
			} else {
				console.log('\n📝 Creating new meeting type...')

				const meetingType = await prisma.meetingType.create({
					data: {
						tenantId: tenantResponse.tenantId,
						name,
						description,
					},
				})

				console.log(`✅ Created meeting type: ${meetingType.name}\n`)
			}
		} catch (error) {
			console.error('❌ Error:', error)
			console.log('')
		}
	}
}

manageMeetingType()
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
