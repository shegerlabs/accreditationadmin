#!/usr/bin/env node

import { BlobServiceClient } from '@azure/storage-blob'
import { PrismaClient, RequestStatus } from '@prisma/client'
import chalk from 'chalk'
import { Command } from 'commander'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'

const prisma = new PrismaClient()
const program = new Command()

interface CountrySummary {
	name: string
	count: number
}

interface CountryStats {
	name: string
	total: number
	byStatus: Record<string, number>
}

interface DownloadOptions {
	countries: string
	output: string
	event?: string
	status?: string
	dryRun?: boolean
}

interface StatsOptions {
	event?: string
}

program
	.name('download-photos')
	.description('Download participant photos from Azure Storage filtered by country')
	.version('1.0.0')

program
	.command('list-countries')
	.description('List all countries with participant count')
	.action(async () => {
		try {
			const countries = await prisma.country.findMany({
				select: {
					id: true,
					name: true,
					code: true,
					_count: {
						select: {
							participantCountries: true,
						},
					},
				},
				orderBy: { name: 'asc' },
			})

			console.log(chalk.blue(`\n📋 Countries with participants:\n`))

			const countriesWithParticipants = countries.filter(
				c => c._count.participantCountries > 0,
			)

			if (countriesWithParticipants.length === 0) {
				console.log(chalk.yellow('No countries with participants found.'))
				return
			}

			countriesWithParticipants.forEach(country => {
				console.log(
					`${chalk.bold(country.code)} - ${country.name}: ${chalk.cyan(String(country._count.participantCountries))} participants`,
				)
			})

			console.log(
				chalk.blue(`\nTotal: ${countriesWithParticipants.length} countries\n`),
			)
		} catch (error) {
			const err = error as Error
			console.error(chalk.red(`❌ Error listing countries: ${err.message}`))
			process.exit(1)
		} finally {
			await prisma.$disconnect()
		}
	})

program
	.command('download')
	.description('Download participant photos filtered by country codes')
	.requiredOption(
		'-c, --countries <codes>',
		'Comma-separated country codes (e.g., ET,KE,NG)',
	)
	.option('-o, --output <directory>', 'Output directory', './downloads/photos')
	.option('-e, --event <eventId>', 'Filter by event ID')
	.option('--status <status>', 'Filter by participant status (e.g., APPROVED, PENDING)')
	.option('--dry-run', 'Show what would be downloaded without actually downloading')
	.action(async (options: DownloadOptions) => {
		try {
			const countryCodes = options.countries
				.split(',')
				.map((c: string) => c.trim().toUpperCase())

			console.log(
				chalk.blue(
					`\n🔍 Finding participants from countries: ${countryCodes.join(', ')}\n`,
				),
			)

			// Build query filters
			const where: {
				country: { code: { in: string[] } }
				documents: { some: { documentType: 'PHOTO' } }
				eventId?: string
				status?: RequestStatus
			} = {
				country: {
					code: { in: countryCodes },
				},
				documents: {
					some: {
						documentType: 'PHOTO',
					},
				},
			}

			if (options.event) {
				where.eventId = options.event
			}

			if (options.status) {
				where.status = options.status.toUpperCase() as RequestStatus
			}

			// Fetch participants with photo documents
			const participants = await prisma.participant.findMany({
				where,
				select: {
					id: true,
					firstName: true,
					familyName: true,
					registrationCode: true,
					country: {
						select: {
							code: true,
							name: true,
						},
					},
					event: {
						select: {
							name: true,
						},
					},
					documents: {
						where: {
							documentType: 'PHOTO',
						},
						select: {
							id: true,
							fileName: true,
							extension: true,
							contentType: true,
						},
					},
				},
				orderBy: [{ country: { code: 'asc' } }, { familyName: 'asc' }],
			})

			if (participants.length === 0) {
				console.log(
					chalk.yellow(
						'No participants with photos found for the specified countries.',
					),
				)
				return
			}

			console.log(
				chalk.green(`✅ Found ${participants.length} participants with photos\n`),
			)

			// Group by country for summary
			const byCountry = participants.reduce<Record<string, CountrySummary>>((acc, p) => {
				const code = p.country.code
				if (!acc[code]) {
					acc[code] = { name: p.country.name, count: 0 }
				}
				acc[code].count++
				return acc
			}, {})

			console.log(chalk.blue('📊 Summary by country:'))
			Object.entries(byCountry).forEach(([code, data]) => {
				console.log(`   ${code} (${data.name}): ${data.count} photos`)
			})
			console.log('')

			if (options.dryRun) {
				console.log(chalk.yellow('🔸 DRY RUN - No files will be downloaded\n'))
				participants.forEach(p => {
					const photo = p.documents[0]
					if (photo) {
						console.log(
							`   ${p.country.code}/${p.registrationCode}_${p.firstName}_${p.familyName}.${photo.extension}`,
						)
					}
				})
				console.log(
					chalk.blue(`\n📁 Would save to: ${path.resolve(options.output)}`),
				)
				return
			}

			// Initialize Azure Blob Storage client
			const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
			if (!connectionString) {
				console.error(
					chalk.red(
						'❌ AZURE_STORAGE_CONNECTION_STRING environment variable is required',
					),
				)
				process.exit(1)
			}

			const blobServiceClient =
				BlobServiceClient.fromConnectionString(connectionString)
			const containerClient =
				blobServiceClient.getContainerClient('accreditation')

			// Create output directory
			const outputDir = path.resolve(options.output)

			// Download photos
			let successCount = 0
			let errorCount = 0

			for (const participant of participants) {
				const photo = participant.documents[0]
				if (!photo) continue

				const countryDir = path.join(outputDir, participant.country.code)
				if (!fs.existsSync(countryDir)) {
					fs.mkdirSync(countryDir, { recursive: true })
				}

				const blobPath = `participants/${participant.id}/${photo.fileName}.${photo.extension}`
				const sanitizedName = `${participant.registrationCode}_${participant.firstName}_${participant.familyName}`
					.replace(/[^a-zA-Z0-9_-]/g, '_')
				const localFileName = `${sanitizedName}.${photo.extension}`
				const localFilePath = path.join(countryDir, localFileName)

				try {
					const blockBlobClient = containerClient.getBlockBlobClient(blobPath)
					const downloadResponse = await blockBlobClient.download(0)

					const buffer = await streamToBuffer(downloadResponse.readableStreamBody)
					fs.writeFileSync(localFilePath, buffer)

					console.log(
						chalk.green(
							`✅ ${participant.country.code}/${localFileName}`,
						),
					)
					successCount++
				} catch (error) {
					const err = error as Error
					console.log(
						chalk.red(
							`❌ Failed: ${participant.country.code}/${localFileName} - ${err.message}`,
						),
					)
					errorCount++
				}
			}

			console.log(chalk.blue(`\n📊 Download complete!`))
			console.log(chalk.green(`   ✅ Success: ${successCount}`))
			if (errorCount > 0) {
				console.log(chalk.red(`   ❌ Failed: ${errorCount}`))
			}
			console.log(chalk.blue(`   📁 Saved to: ${outputDir}\n`))
		} catch (error) {
			const err = error as Error
			console.error(chalk.red(`❌ Error downloading photos: ${err.message}`))
			process.exit(1)
		} finally {
			await prisma.$disconnect()
		}
	})

program
	.command('stats')
	.description('Show photo statistics by country')
	.option('-e, --event <eventId>', 'Filter by event ID')
	.action(async (options: StatsOptions) => {
		try {
			const where: {
				documents: { some: { documentType: 'PHOTO' } }
				eventId?: string
			} = {
				documents: {
					some: {
						documentType: 'PHOTO',
					},
				},
			}

			if (options.event) {
				where.eventId = options.event
			}

			const participants = await prisma.participant.findMany({
				where,
				select: {
					country: {
						select: {
							code: true,
							name: true,
						},
					},
					status: true,
				},
			})

			// Group by country
			const stats = participants.reduce<Record<string, CountryStats>>((acc, p) => {
				const code = p.country.code
				if (!acc[code]) {
					acc[code] = {
						name: p.country.name,
						total: 0,
						byStatus: {},
					}
				}
				acc[code].total++
				acc[code].byStatus[p.status] = (acc[code].byStatus[p.status] || 0) + 1
				return acc
			}, {})

			console.log(chalk.blue(`\n📊 Photo Statistics by Country\n`))

			const sortedStats = Object.entries(stats).sort((a, b) => b[1].total - a[1].total)

			sortedStats.forEach(([code, data]) => {
				console.log(chalk.bold(`${code} - ${data.name}: ${data.total} photos`))
				Object.entries(data.byStatus).forEach(([status, count]) => {
					const statusColor =
						status === 'APPROVED'
							? chalk.green
							: status === 'REJECTED'
								? chalk.red
								: chalk.yellow
					console.log(`   ${statusColor(status)}: ${count}`)
				})
			})

			console.log(chalk.blue(`\nTotal: ${participants.length} photos\n`))
		} catch (error) {
			const err = error as Error
			console.error(chalk.red(`❌ Error fetching stats: ${err.message}`))
			process.exit(1)
		} finally {
			await prisma.$disconnect()
		}
	})

async function streamToBuffer(
	readableStream: NodeJS.ReadableStream | undefined,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = []

		if (!readableStream) {
			reject(new Error('No readable stream provided'))
			return
		}

		if (readableStream instanceof Readable) {
			readableStream.on('data', (data: Buffer | Uint8Array) => {
				chunks.push(data instanceof Buffer ? data : Buffer.from(data))
			})
			readableStream.on('end', () => {
				resolve(Buffer.concat(chunks))
			})
			readableStream.on('error', reject)
		} else if (typeof (readableStream as unknown as ReadableStream).getReader === 'function') {
			// Web ReadableStream
			const reader = (readableStream as unknown as ReadableStream<Uint8Array>).getReader()
			const processChunk = ({ done, value }: ReadableStreamReadResult<Uint8Array>): void => {
				if (done) {
					resolve(Buffer.concat(chunks))
					return
				}
				if (value) {
					chunks.push(Buffer.from(value))
				}
				reader.read().then(processChunk).catch(reject)
			}
			reader.read().then(processChunk).catch(reject)
		} else {
			reject(new Error('Invalid stream type'))
		}
	})
}

program.parse()
