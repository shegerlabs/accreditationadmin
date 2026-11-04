// manage-country.ts
// Interactive script to create or update a country
//
// USAGE:
//   npm run manage-country
//   OR
//   npx tsx prisma/manage-country.ts
//
// FEATURES:
//   - Create new countries
//   - Update existing countries
//   - Delete countries
//   - List all countries
//   - Prevents duplicate countries (by name or code)
//   - Interactive prompts for name and code
//
// NOTES:
//   - This script is idempotent (safe to run multiple times)
//   - Will update existing countries instead of creating duplicates
//   - Country code should typically be ISO 3166-1 alpha-2 or alpha-3 format

import { PrismaClient } from '@prisma/client'
import prompts from 'prompts'
import { printTable } from './utils/table.js'

const prisma = new PrismaClient()

async function manageCountry() {
	console.log('🌍 Interactive Country Manager\n')
	console.log('This tool helps you create or update countries.\n')

	let continueLoop = true

	while (continueLoop) {
		try {
			// 1. Fetch all existing countries
			const existingCountries = await prisma.country.findMany({
				orderBy: { name: 'asc' },
			})

			// 2. Determine action
			const actionResponse = await prompts({
				type: 'select',
				name: 'action',
				message: 'What would you like to do?',
				choices: [
					{ title: 'Create a new country', value: 'create' },
					{ title: 'Update an existing country', value: 'update' },
					{ title: 'Delete a country', value: 'delete' },
					{ title: 'List all countries', value: 'list' },
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
				console.log('\n📋 Existing Countries:\n')
				printTable(
					[
						{ header: 'Code', key: 'code', width: 6 },
						{ header: 'Name', key: 'name', width: 40 },
					],
					existingCountries.map(c => ({
						code: c.code,
						name: c.name,
					})),
				)
				console.log(`Total: ${existingCountries.length} countries\n`)
				continue
			}

			let selectedCountryId: string | undefined

			// Handle update/delete - select country
			if (action === 'update' || action === 'delete') {
				if (existingCountries.length === 0) {
					console.log('\n❌ No countries found\n')
					continue
				}

				const countryResponse = await prompts({
					type: 'select',
					name: 'countryId',
					message: `Select the country to ${action}:`,
					choices: existingCountries.map(country => ({
						title: `${country.name} (${country.code})`,
						value: country.id,
					})),
				})

				if (!countryResponse.countryId) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				selectedCountryId = countryResponse.countryId

				// Handle delete
				if (action === 'delete') {
					const selectedCountry = existingCountries.find(c => c.id === selectedCountryId)
					const confirmResponse = await prompts({
						type: 'confirm',
						name: 'confirm',
						message: `Are you sure you want to delete country "${selectedCountry?.name}"?`,
						initial: false,
					})

					if (!confirmResponse.confirm) {
						console.log('\n❌ Operation cancelled\n')
						continue
					}

					await prisma.country.delete({
						where: { id: selectedCountryId },
					})

					console.log(`\n✅ Deleted country: ${selectedCountry?.name}\n`)
					continue
				}
			}

			// 3. Get country data to update (if updating)
			let existingCountry: (typeof existingCountries)[0] | undefined
			if (action === 'update' && selectedCountryId) {
				existingCountry = existingCountries.find(c => c.id === selectedCountryId)
			}

			// 4. Interactive prompts for name and code
			const dataResponse = await prompts([
				{
					type: 'text',
					name: 'name',
					message: 'Enter country name:',
					initial: existingCountry?.name,
					validate: (value: string) => {
						if (!value || value.trim().length === 0) {
							return 'Country name is required'
						}
						return true
					},
				},
				{
					type: 'text',
					name: 'code',
					message: 'Enter country code (e.g., US, GB, FR):',
					initial: existingCountry?.code,
					validate: (value: string) => {
						if (!value || value.trim().length === 0) {
							return 'Country code is required'
						}
						if (value.trim().length < 2 || value.trim().length > 3) {
							return 'Country code should be 2-3 characters'
						}
						return true
					},
				},
			])

			// Handle user cancellation (Ctrl+C)
			if (!dataResponse.name || !dataResponse.code) {
				console.log('\n❌ Operation cancelled\n')
				continue
			}

			const name = dataResponse.name.trim()
			const code = dataResponse.code.trim().toUpperCase()

			// 5. Check for duplicates
			const duplicateByName = existingCountries.find(
				c =>
					c.id !== selectedCountryId &&
					c.name.toLowerCase() === name.toLowerCase(),
			)
			const duplicateByCode = existingCountries.find(
				c => c.id !== selectedCountryId && c.code.toUpperCase() === code,
			)

			if (duplicateByName) {
				console.log(`\n❌ Country with name "${name}" already exists\n`)
				continue
			}

			if (duplicateByCode) {
				console.log(`\n❌ Country with code "${code}" already exists\n`)
				continue
			}

			// 6. Create or update country
			if (action === 'update' && selectedCountryId) {
				console.log('\n📝 Updating country...')

				const country = await prisma.country.update({
					where: { id: selectedCountryId },
					data: {
						name,
						code,
					},
				})

				console.log(`✅ Updated country: ${country.name} (${country.code})\n`)
			} else {
				console.log('\n📝 Creating new country...')

				const country = await prisma.country.create({
					data: {
						name,
						code,
					},
				})

				console.log(`✅ Created country: ${country.name} (${country.code})\n`)
			}
		} catch (error) {
			console.error('❌ Error:', error)
			console.log('')
		}
	}
}

manageCountry()
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
