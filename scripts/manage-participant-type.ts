// manage-participant-type.ts
// Interactive script to create or update participant types
//
// USAGE:
//   npm run manage-participant-type
//   OR
//   npx tsx prisma/manage-participant-type.ts
//
// FEATURES:
//   - Create new participant types
//   - Update existing participant types
//   - Delete participant types
//   - List all participant types
//   - Configure priority and various flags
//   - Requires tenant selection
//   - Prevents duplicate participant types (by tenant + name)
//
// NOTES:
//   - This script is idempotent (safe to run multiple times)
//   - Will update existing participant types instead of creating duplicates

import { PrismaClient, Priority } from '@prisma/client'
import prompts from 'prompts'
import { printTable } from './utils/table.js'

const prisma = new PrismaClient()

async function manageParticipantType() {
	console.log('👥 Interactive Participant Type Manager\n')
	console.log('This tool helps you create or update participant types.\n')

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
			// 3. Fetch existing participant types for this tenant
			const existingParticipantTypes = await prisma.participantType.findMany({
				where: { tenantId: tenantResponse.tenantId },
				orderBy: { name: 'asc' },
			})

			// 4. Determine action
			const actionResponse = await prompts({
				type: 'select',
				name: 'action',
				message: 'What would you like to do?',
				choices: [
					{ title: 'Create a new participant type', value: 'create' },
					{ title: 'Update an existing participant type', value: 'update' },
					{ title: 'Delete a participant type', value: 'delete' },
					{ title: 'List all participant types', value: 'list' },
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
				console.log(`\n📋 Participant Types for ${selectedTenant.name}:\n`)
				printTable(
					[
						{ header: 'Name', key: 'name', width: 20 },
						{ header: 'Priority', key: 'priority', width: 10 },
						{ header: 'Description', key: 'description', width: 35 },
					],
					existingParticipantTypes.map(pt => ({
						name: pt.name,
						priority: pt.priority,
						description: pt.description,
					})),
				)
				console.log(`Total: ${existingParticipantTypes.length} participant types\n`)
				continue
			}

			let selectedParticipantTypeId: string | undefined

			// Handle update/delete - select participant type
			if (action === 'update' || action === 'delete') {
				if (existingParticipantTypes.length === 0) {
					console.log('\n❌ No participant types found for this tenant\n')
					continue
				}

				const ptResponse = await prompts({
					type: 'select',
					name: 'participantTypeId',
					message: `Select the participant type to ${action}:`,
					choices: existingParticipantTypes.map(pt => ({
						title: `${pt.name} (${pt.priority})`,
						description: pt.description,
						value: pt.id,
					})),
				})

				if (!ptResponse.participantTypeId) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				selectedParticipantTypeId = ptResponse.participantTypeId

				// Handle delete
				if (action === 'delete') {
					const selectedPt = existingParticipantTypes.find(
						pt => pt.id === selectedParticipantTypeId,
					)
					const confirmResponse = await prompts({
						type: 'confirm',
						name: 'confirm',
						message: `Are you sure you want to delete participant type "${selectedPt?.name}"?`,
						initial: false,
					})

					if (!confirmResponse.confirm) {
						console.log('\n❌ Operation cancelled\n')
						continue
					}

					await prisma.participantType.delete({
						where: { id: selectedParticipantTypeId },
					})

					console.log(`\n✅ Deleted participant type: ${selectedPt?.name}\n`)
					continue
				}
			}

			// 5. Get participant type data
			let existingParticipantType: (typeof existingParticipantTypes)[0] | undefined
			if (action === 'update' && selectedParticipantTypeId) {
				existingParticipantType = existingParticipantTypes.find(
					pt => pt.id === selectedParticipantTypeId,
				)
			}

			// 6. Interactive prompts
			const dataResponse = await prompts([
				{
					type: 'text',
					name: 'name',
					message: 'Enter participant type name:',
					initial: existingParticipantType?.name,
					validate: (value: string) => {
						if (!value || value.trim().length === 0) {
							return 'Participant type name is required'
						}
						return true
					},
				},
				{
					type: 'text',
					name: 'description',
					message: 'Enter description:',
					initial: existingParticipantType?.description,
					validate: (value: string) => {
						if (!value || value.trim().length === 0) {
							return 'Description is required'
						}
						return true
					},
				},
				{
					type: 'select',
					name: 'priority',
					message: 'Select priority:',
					choices: [
						{ title: 'LOW', value: Priority.LOW },
						{ title: 'MEDIUM', value: Priority.MEDIUM },
						{ title: 'HIGH', value: Priority.HIGH },
					],
					initial: existingParticipantType
						? Object.values(Priority).indexOf(existingParticipantType.priority)
						: 1,
				},
				{
					type: 'confirm',
					name: 'isExemptedFromFullQuota',
					message: 'Is exempted from full quota?',
					initial: existingParticipantType?.isExemptedFromFullQuota ?? false,
				},
				{
					type: 'confirm',
					name: 'isExemptedFromOpenSessionQuota',
					message: 'Is exempted from open session quota?',
					initial: existingParticipantType?.isExemptedFromOpenSessionQuota ?? false,
				},
				{
					type: 'confirm',
					name: 'isExemptedFromClosedSessionQuota',
					message: 'Is exempted from closed session quota?',
					initial: existingParticipantType?.isExemptedFromClosedSessionQuota ?? false,
				},
			])

			if (!dataResponse.name || !dataResponse.description) {
				console.log('\n❌ Operation cancelled\n')
				continue
			}

			const name = dataResponse.name.trim()
			const description = dataResponse.description.trim()

			// 7. Check for duplicates
			const duplicate = existingParticipantTypes.find(
				pt =>
					pt.id !== selectedParticipantTypeId &&
					pt.name.toLowerCase() === name.toLowerCase(),
			)

			if (duplicate) {
				console.log(`\n❌ Participant type "${name}" already exists for this tenant\n`)
				continue
			}

			// 8. Create or update participant type
			const participantTypeData = {
				name,
				description,
				priority: dataResponse.priority,
				isExemptedFromFullQuota: dataResponse.isExemptedFromFullQuota,
				isExemptedFromOpenSessionQuota: dataResponse.isExemptedFromOpenSessionQuota,
				isExemptedFromClosedSessionQuota: dataResponse.isExemptedFromClosedSessionQuota,
			}

			if (action === 'update' && selectedParticipantTypeId) {
				console.log('\n📝 Updating participant type...')

				const participantType = await prisma.participantType.update({
					where: { id: selectedParticipantTypeId },
					data: participantTypeData,
				})

				console.log(`✅ Updated participant type: ${participantType.name}\n`)
			} else {
				console.log('\n📝 Creating new participant type...')

				const participantType = await prisma.participantType.create({
					data: {
						tenantId: tenantResponse.tenantId,
						...participantTypeData,
					},
				})

				console.log(`✅ Created participant type: ${participantType.name}\n`)
			}
		} catch (error) {
			console.error('❌ Error:', error)
			console.log('')
		}
	}
}

manageParticipantType()
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
