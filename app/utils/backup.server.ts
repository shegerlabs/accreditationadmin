import { BackupType, DatabaseBackup } from '@prisma/client'
import { createGzip, createGunzip } from 'zlib'
import { Pool, FieldDef } from 'pg'
import { prisma } from './db.server'
import { getSetting, SettingKeys } from './settings.server'
import {
	deleteFile,
	ensureContainerExists,
	getFile,
	uploadFile,
} from './storage.server'

const BACKUP_CONTAINER = 'backups'
const BACKUP_DIRECTORY = 'database'

/**
 * Format bytes to human readable string
 */
export function formatFileSize(bytes: number | bigint): string {
	const numBytes = typeof bytes === 'bigint' ? Number(bytes) : bytes
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	let unitIndex = 0
	let size = numBytes

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024
		unitIndex++
	}

	return `${size.toFixed(2)} ${units[unitIndex]}`
}

/**
 * Generate a backup filename with timestamp
 */
function generateBackupFileName(name?: string): string {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
	const baseName = name
		? name.toLowerCase().replace(/[^a-z0-9]/gi, '-')
		: 'backup'
	return `${baseName}-${timestamp}`
}

/**
 * Escape a string value for SQL
 * Uses PostgreSQL's standard_conforming_strings mode (backslashes are literal)
 * Escapes single quotes by doubling them
 */
function escapeSqlValue(value: unknown): string {
	if (value === null || value === undefined) {
		return 'NULL'
	}
	if (typeof value === 'boolean') {
		return value ? 'TRUE' : 'FALSE'
	}
	if (typeof value === 'number') {
		// Validate number is finite to prevent NaN/Infinity injection
		if (!Number.isFinite(value)) {
			return 'NULL'
		}
		return String(value)
	}
	if (typeof value === 'bigint') {
		return String(value)
	}
	if (value instanceof Date) {
		return `'${value.toISOString()}'`
	}
	if (Buffer.isBuffer(value)) {
		// Use hex format for bytea (safe, no escaping issues)
		return `'\\x${value.toString('hex')}'`
	}
	if (typeof value === 'object') {
		// JSON/JSONB fields - JSON.stringify produces safe output, then escape quotes
		return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`
	}
	// String - escape single quotes by doubling them
	// Also remove null bytes which can cause issues
	const sanitized = String(value).replace(/\0/g, '')
	return `'${sanitized.replace(/'/g, "''")}'`
}

/**
 * Escape an identifier (table name, column name) for SQL
 */
function escapeIdentifier(identifier: string): string {
	return `"${identifier.replace(/"/g, '""')}"`
}

/**
 * Get database connection URL from environment
 */
function getDatabaseUrl(): string {
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error('DATABASE_URL environment variable is not set')
	}
	return url
}

/**
 * Create a pg Pool from a connection string
 * Automatically enables SSL for secure connections (required by Azure PostgreSQL)
 */
function createPool(connectionString: string): Pool {
	const url = new URL(connectionString)
	const sslMode = url.searchParams.get('sslmode')
	const host = url.hostname

	// Determine SSL configuration:
	// 1. If sslmode=disable is explicitly set, don't use SSL
	// 2. If host is localhost/127.0.0.1, don't use SSL (local dev)
	// 3. Otherwise, use SSL (production/remote databases like Azure)
	const isLocalhost = host === 'localhost' || host === '127.0.0.1'
	const sslDisabled = sslMode === 'disable'

	const sslConfig = sslDisabled || isLocalhost
		? false
		: {
			rejectUnauthorized: false, // Allow self-signed certificates (common in Azure)
		}

	return new Pool({
		connectionString,
		ssl: sslConfig,
	})
}

/**
 * Generate complete SQL dump including schema and data
 */
async function generateSqlDump(options?: {
	connectionString?: string
	excludeBackupId?: string
}): Promise<string> {
	const { connectionString, excludeBackupId } = options || {}
	const pool = createPool(connectionString || getDatabaseUrl())
	const sqlParts: string[] = []

	try {
		// Header
		sqlParts.push('-- PostgreSQL Database Dump')
		sqlParts.push(`-- Generated: ${new Date().toISOString()}`)
		sqlParts.push('-- Format: SQL')
		sqlParts.push('')
		sqlParts.push('SET statement_timeout = 0;')
		sqlParts.push('SET lock_timeout = 0;')
		sqlParts.push('SET client_encoding = \'UTF8\';')
		sqlParts.push('SET standard_conforming_strings = on;')
		sqlParts.push('SET check_function_bodies = false;')
		sqlParts.push('SET client_min_messages = warning;')
		sqlParts.push('')

		// 1. Export ENUM types
		sqlParts.push('-- ENUM TYPES')
		const enums = await pool.query(`
			SELECT t.typname AS enum_name,
				   array_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
			FROM pg_type t
			JOIN pg_enum e ON t.oid = e.enumtypid
			JOIN pg_namespace n ON t.typnamespace = n.oid
			WHERE n.nspname = 'public'
			GROUP BY t.typname
		`)

		for (const enumType of enums.rows) {
			// Handle PostgreSQL array - may come as JS array or as string like '{val1,val2}'
			let enumValues: string[]
			if (Array.isArray(enumType.enum_values)) {
				enumValues = enumType.enum_values
			} else if (typeof enumType.enum_values === 'string') {
				// Parse PostgreSQL array string format: {val1,val2,val3}
				const arrayStr = enumType.enum_values as string
				enumValues = arrayStr
					.slice(1, -1) // Remove { and }
					.split(',')
					.map((v: string) => v.replace(/^"|"$/g, '')) // Remove quotes if present
			} else {
				console.warn(`Unexpected enum_values type for ${enumType.enum_name}:`, typeof enumType.enum_values)
				continue
			}
			const values = enumValues.map((v: string) => `'${v}'`).join(', ')
			sqlParts.push(`DROP TYPE IF EXISTS ${escapeIdentifier(enumType.enum_name)} CASCADE;`)
			sqlParts.push(`CREATE TYPE ${escapeIdentifier(enumType.enum_name)} AS ENUM (${values});`)
		}
		sqlParts.push('')

		// 2. Get all tables in dependency order
		const tablesResult = await pool.query(`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public'
			AND table_type = 'BASE TABLE'
			AND table_name NOT LIKE '_prisma%'
			ORDER BY table_name
		`)
		const tableNames = tablesResult.rows.map((r: { table_name: string }) => r.table_name)

		// 3. Export table schemas
		sqlParts.push('-- TABLE SCHEMAS')
		for (const tableName of tableNames) {
			// Get column definitions
			const columns = await pool.query(`
				SELECT
					c.column_name,
					c.data_type,
					c.udt_name,
					c.character_maximum_length,
					c.numeric_precision,
					c.numeric_scale,
					c.is_nullable,
					c.column_default
				FROM information_schema.columns c
				WHERE c.table_schema = 'public'
				AND c.table_name = $1
				ORDER BY c.ordinal_position
			`, [tableName])

			if (columns.rows.length === 0) continue

			sqlParts.push(`DROP TABLE IF EXISTS ${escapeIdentifier(tableName)} CASCADE;`)

			const columnDefs: string[] = []
			for (const col of columns.rows) {
				let dataType = col.data_type.toUpperCase()

				// Handle special types
				if (col.data_type === 'USER-DEFINED') {
					dataType = escapeIdentifier(col.udt_name)
				} else if (col.data_type === 'character varying') {
					dataType = col.character_maximum_length
						? `VARCHAR(${col.character_maximum_length})`
						: 'VARCHAR'
				} else if (col.data_type === 'character') {
					dataType = col.character_maximum_length
						? `CHAR(${col.character_maximum_length})`
						: 'CHAR'
				} else if (col.data_type === 'numeric') {
					dataType = col.numeric_precision
						? `NUMERIC(${col.numeric_precision}, ${col.numeric_scale || 0})`
						: 'NUMERIC'
				} else if (col.data_type === 'ARRAY') {
					// Handle array types
					const baseType = col.udt_name.replace(/^_/, '')
					dataType = `${baseType.toUpperCase()}[]`
				} else if (col.udt_name === 'text') {
					dataType = 'TEXT'
				} else if (col.udt_name === 'int4') {
					dataType = 'INTEGER'
				} else if (col.udt_name === 'int8') {
					dataType = 'BIGINT'
				} else if (col.udt_name === 'bool') {
					dataType = 'BOOLEAN'
				} else if (col.udt_name === 'float8') {
					dataType = 'DOUBLE PRECISION'
				} else if (col.udt_name === 'timestamp') {
					dataType = 'TIMESTAMP WITHOUT TIME ZONE'
				} else if (col.udt_name === 'timestamptz') {
					dataType = 'TIMESTAMP WITH TIME ZONE'
				} else if (col.udt_name === 'jsonb') {
					dataType = 'JSONB'
				} else if (col.udt_name === 'json') {
					dataType = 'JSON'
				} else if (col.udt_name === 'uuid') {
					dataType = 'UUID'
				} else if (col.udt_name === 'bytea') {
					dataType = 'BYTEA'
				}

				let colDef = `${escapeIdentifier(col.column_name)} ${dataType}`

				if (col.is_nullable === 'NO') {
					colDef += ' NOT NULL'
				}

				if (col.column_default) {
					colDef += ` DEFAULT ${col.column_default}`
				}

				columnDefs.push(colDef)
			}

			sqlParts.push(`CREATE TABLE ${escapeIdentifier(tableName)} (`)
			sqlParts.push('  ' + columnDefs.join(',\n  '))
			sqlParts.push(');')
			sqlParts.push('')
		}

		// 4. Export primary keys
		sqlParts.push('-- PRIMARY KEYS')
		const primaryKeys = await pool.query(`
			SELECT
				tc.table_name,
				tc.constraint_name,
				string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
			WHERE tc.table_schema = 'public'
			AND tc.constraint_type = 'PRIMARY KEY'
			GROUP BY tc.table_name, tc.constraint_name
		`)

		for (const pk of primaryKeys.rows) {
			const columns = pk.columns.split(', ').map((c: string) => escapeIdentifier(c)).join(', ')
			sqlParts.push(`ALTER TABLE ${escapeIdentifier(pk.table_name)} ADD CONSTRAINT ${escapeIdentifier(pk.constraint_name)} PRIMARY KEY (${columns});`)
		}
		sqlParts.push('')

		// 5. Export unique constraints
		sqlParts.push('-- UNIQUE CONSTRAINTS')
		const uniqueConstraints = await pool.query(`
			SELECT
				tc.table_name,
				tc.constraint_name,
				string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
			WHERE tc.table_schema = 'public'
			AND tc.constraint_type = 'UNIQUE'
			GROUP BY tc.table_name, tc.constraint_name
		`)

		for (const uc of uniqueConstraints.rows) {
			const columns = uc.columns.split(', ').map((c: string) => escapeIdentifier(c)).join(', ')
			sqlParts.push(`ALTER TABLE ${escapeIdentifier(uc.table_name)} ADD CONSTRAINT ${escapeIdentifier(uc.constraint_name)} UNIQUE (${columns});`)
		}
		sqlParts.push('')

		// 6. Export foreign keys (after all tables are created)
		sqlParts.push('-- FOREIGN KEYS')
		const foreignKeys = await pool.query(`
			SELECT
				tc.table_name,
				tc.constraint_name,
				kcu.column_name,
				ccu.table_name AS foreign_table_name,
				ccu.column_name AS foreign_column_name,
				rc.update_rule,
				rc.delete_rule
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
			JOIN information_schema.constraint_column_usage ccu
				ON ccu.constraint_name = tc.constraint_name
				AND ccu.table_schema = tc.table_schema
			JOIN information_schema.referential_constraints rc
				ON rc.constraint_name = tc.constraint_name
				AND rc.constraint_schema = tc.table_schema
			WHERE tc.table_schema = 'public'
			AND tc.constraint_type = 'FOREIGN KEY'
		`)

		for (const fk of foreignKeys.rows) {
			let fkSql = `ALTER TABLE ${escapeIdentifier(fk.table_name)} ADD CONSTRAINT ${escapeIdentifier(fk.constraint_name)} `
			fkSql += `FOREIGN KEY (${escapeIdentifier(fk.column_name)}) `
			fkSql += `REFERENCES ${escapeIdentifier(fk.foreign_table_name)} (${escapeIdentifier(fk.foreign_column_name)})`

			if (fk.delete_rule && fk.delete_rule !== 'NO ACTION') {
				fkSql += ` ON DELETE ${fk.delete_rule}`
			}
			if (fk.update_rule && fk.update_rule !== 'NO ACTION') {
				fkSql += ` ON UPDATE ${fk.update_rule}`
			}

			sqlParts.push(fkSql + ';')
		}
		sqlParts.push('')

		// 7. Export indexes (non-primary, non-unique)
		sqlParts.push('-- INDEXES')
		const indexes = await pool.query(`
			SELECT indexdef
			FROM pg_indexes
			WHERE schemaname = 'public'
			AND indexname NOT IN (
				SELECT constraint_name
				FROM information_schema.table_constraints
				WHERE table_schema = 'public'
				AND constraint_type IN ('PRIMARY KEY', 'UNIQUE')
			)
		`)

		for (const idx of indexes.rows) {
			sqlParts.push(idx.indexdef + ';')
		}
		sqlParts.push('')

		// 8. Export table data
		sqlParts.push('-- TABLE DATA')

		// Get tables in order that respects foreign keys
		const orderedTables = await getTablesInDependencyOrder(pool)

		for (const tableName of orderedTables) {
			const data = await pool.query(`SELECT * FROM ${escapeIdentifier(tableName)}`)

			// Filter out the current backup record to avoid restoring an IN_PROGRESS backup
			let rows = data.rows
			if (tableName === 'DatabaseBackup' && excludeBackupId) {
				rows = rows.filter((row: any) => row.id !== excludeBackupId)
			}

			if (rows.length === 0) continue

			// Get column names
			const columnNames = data.fields.map((f: FieldDef) => f.name)

			// Add comment as a separate statement with semicolon to prevent merging
			sqlParts.push(`SELECT 1; -- Data for table: ${tableName}`)

			for (const row of rows) {
				const values = columnNames.map((col: string) => escapeSqlValue(row[col]))
				const columns = columnNames.map((c: string) => escapeIdentifier(c)).join(', ')
				sqlParts.push(`INSERT INTO ${escapeIdentifier(tableName)} (${columns}) VALUES (${values.join(', ')});`)
			}

			sqlParts.push('')
		}

		// 9. Update sequences
		sqlParts.push('-- SEQUENCE VALUES')
		const sequences = await pool.query(`
			SELECT
				seq.relname AS sequence_name,
				tab.relname AS table_name,
				attr.attname AS column_name
			FROM pg_class seq
			JOIN pg_depend dep ON seq.oid = dep.objid
			JOIN pg_class tab ON dep.refobjid = tab.oid
			JOIN pg_attribute attr ON attr.attrelid = tab.oid AND attr.attnum = dep.refobjsubid
			WHERE seq.relkind = 'S'
			AND dep.deptype = 'a'
		`)

		for (const seq of sequences.rows) {
			// Get max value from the table
			const maxResult = await pool.query(
				`SELECT COALESCE(MAX(${escapeIdentifier(seq.column_name)}), 0) + 1 AS next_val FROM ${escapeIdentifier(seq.table_name)}`
			)
			const nextVal = maxResult.rows[0]?.next_val || 1
			sqlParts.push(`SELECT setval('${seq.sequence_name}', ${nextVal}, false);`)
		}
		sqlParts.push('')

		sqlParts.push('-- END OF DUMP')

		return sqlParts.join('\n')
	} finally {
		await pool.end()
	}
}

/**
 * Get tables in dependency order (tables with no foreign keys first)
 * Uses a predefined order based on the application's data model to ensure
 * proper restore order that respects foreign key constraints.
 */
async function getTablesInDependencyOrder(pool: Pool): Promise<string[]> {
	// Get all tables in the database
	const tablesResult = await pool.query(`
		SELECT table_name
		FROM information_schema.tables
		WHERE table_schema = 'public'
		AND table_type = 'BASE TABLE'
		AND table_name NOT LIKE '_prisma%'
	`)

	const allTables = new Set<string>(tablesResult.rows.map((r: { table_name: string }) => r.table_name))

	// Define preferred order based on the seed script and data model dependencies
	// Tables listed first have no dependencies, tables listed later depend on earlier ones
	const preferredOrder = [
		// 1. Base tables with no foreign keys
		'Role',
		'Permission',
		'Country',
		'Title',
		'Tenant',

		// 2. Tables that depend on base tables
		'User',  // depends on Tenant, Role
		'Password',  // depends on User
		'Session',  // depends on User
		'Verification',  // depends on User

		// 3. Tenant-scoped reference data
		'ParticipantType',  // depends on Tenant
		'MeetingType',  // depends on Tenant
		'BadgeTemplate',  // depends on Tenant

		// 4. Events and workflows
		'Event',  // depends on Tenant
		'WorkflowTemplate',  // depends on Tenant
		'StepTemplate',  // depends on WorkflowTemplate, Role
		'Workflow',  // depends on Event, ParticipantType
		'Step',  // depends on Workflow, Role

		// 5. Event configuration
		'Restriction',  // depends on Tenant, Event
		'Constraint',  // depends on Tenant, Restriction, ParticipantType
		'Invitation',  // depends on Event, Country
		'InvitationConstraint',  // depends on Invitation, ParticipantType

		// 6. Menus
		'Menu',  // depends on Role
		'MenuItem',  // depends on Menu, Role

		// 7. Participants and related data
		'Participant',  // depends on Event, User, Country, etc.
		'Attachment',  // depends on Participant
		'Approval',  // depends on Participant, Step, User
		'BadgePrint',  // depends on Participant, User
		'Reprint',  // depends on Participant, User

		// 8. System tables
		'SystemSetting',  // depends on Tenant
		'AuditLog',  // depends on User, Tenant
		'DatabaseBackup',  // depends on User
	]

	// Build result: first add tables in preferred order if they exist
	const result: string[] = []
	for (const table of preferredOrder) {
		if (allTables.has(table)) {
			result.push(table)
			allTables.delete(table)
		}
	}

	// Then add any remaining tables not in the preferred order
	// (handles any new tables added to the schema)
	for (const table of allTables) {
		result.push(table)
	}

	return result
}

/**
 * Create a database backup
 */
export async function createBackup(options: {
	userId: string
	name?: string
	backupType?: BackupType
}): Promise<DatabaseBackup> {
	const { userId, name, backupType = 'MANUAL' } = options
	const fileName = generateBackupFileName(name)
	const displayName = name || `Backup ${new Date().toLocaleString()}`

	// Create backup record in PENDING state
	const backup = await prisma.databaseBackup.create({
		data: {
			name: displayName,
			fileName: `${BACKUP_DIRECTORY}/${fileName}.sql.gz`,
			sizeBytes: 0n,
			status: 'PENDING',
			backupType,
			createdById: userId,
		},
	})

	try {
		// Update to IN_PROGRESS
		await prisma.databaseBackup.update({
			where: { id: backup.id },
			data: {
				status: 'IN_PROGRESS',
				startedAt: new Date(),
			},
		})

		// Generate SQL dump (exclude current backup to avoid restoring IN_PROGRESS state)
		const sqlDump = await generateSqlDump({ excludeBackupId: backup.id })
		const backupBuffer = Buffer.from(sqlDump, 'utf-8')

		// Compress the output
		const gzip = createGzip()
		const compressed = await new Promise<Buffer>((resolve, reject) => {
			const chunks: Uint8Array[] = []
			gzip.on('data', chunk => chunks.push(chunk))
			gzip.on('end', () => resolve(Buffer.concat(chunks)))
			gzip.on('error', reject)
			gzip.write(backupBuffer)
			gzip.end()
		})

		// Ensure the backup container exists
		await ensureContainerExists(BACKUP_CONTAINER)

		// Upload to Azure Blob Storage
		await uploadFile({
			containerName: BACKUP_CONTAINER,
			directory: BACKUP_DIRECTORY,
			fileName,
			extension: 'sql.gz',
			blob: compressed,
		})

		// Update backup record with success
		const updatedBackup = await prisma.databaseBackup.update({
			where: { id: backup.id },
			data: {
				status: 'COMPLETED',
				sizeBytes: BigInt(compressed.length),
				completedAt: new Date(),
			},
		})

		// Trigger cleanup of old backups
		await cleanupOldBackups()

		return updatedBackup
	} catch (error) {
		// Update backup record with failure
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error occurred'
		await prisma.databaseBackup.update({
			where: { id: backup.id },
			data: {
				status: 'FAILED',
				errorMessage,
				completedAt: new Date(),
			},
		})
		throw error
	}
}

/**
 * Get backup buffer from Azure Blob Storage
 */
export async function getBackupBuffer(backupId: string): Promise<Buffer> {
	const backup = await prisma.databaseBackup.findUnique({
		where: { id: backupId },
	})

	if (!backup) {
		throw new Error('Backup not found')
	}

	if (backup.status !== 'COMPLETED') {
		throw new Error('Backup is not complete')
	}

	return getFile({
		containerName: BACKUP_CONTAINER,
		fileName: backup.fileName,
	})
}

/**
 * Get a preview of backup contents (decompressed SQL) with schema and data separated
 */
export async function getBackupPreview(
	backupId: string,
	maxLines: number = 100
): Promise<{
	schema: { content: string; totalLines: number; truncated: boolean }
	data: { content: string; totalLines: number; truncated: boolean }
}> {
	const backup = await prisma.databaseBackup.findUnique({
		where: { id: backupId },
	})

	if (!backup) {
		throw new Error('Backup not found')
	}

	if (backup.status !== 'COMPLETED') {
		throw new Error('Backup is not complete')
	}

	// Download and decompress
	const compressedData = await getFile({
		containerName: BACKUP_CONTAINER,
		fileName: backup.fileName,
	})

	const gunzip = createGunzip()
	const decompressed = await new Promise<Buffer>((resolve, reject) => {
		const chunks: Uint8Array[] = []
		gunzip.on('data', chunk => chunks.push(chunk))
		gunzip.on('end', () => resolve(Buffer.concat(chunks)))
		gunzip.on('error', reject)
		gunzip.write(compressedData)
		gunzip.end()
	})

	const fullContent = decompressed.toString('utf-8')
	const lines = fullContent.split('\n')

	// Separate schema and data lines
	const schemaLines: string[] = []
	const dataLines: string[] = []
	let inDataSection = false

	for (const line of lines) {
		const trimmedLine = line.trim()

		// Detect when we enter the data section
		if (trimmedLine === '-- TABLE DATA') {
			inDataSection = true
		}

		// Detect when we leave the data section (sequences at the end)
		if (trimmedLine === '-- SEQUENCE VALUES') {
			inDataSection = false
		}

		if (inDataSection) {
			dataLines.push(line)
		} else {
			schemaLines.push(line)
		}
	}

	// Create schema preview
	const schemaTotalLines = schemaLines.length
	const schemaTruncated = schemaTotalLines > maxLines
	const schemaPreviewLines = schemaLines.slice(0, maxLines)
	const schemaContent = schemaPreviewLines.join('\n')

	// Create data preview
	const dataTotalLines = dataLines.length
	const dataTruncated = dataTotalLines > maxLines
	const dataPreviewLines = dataLines.slice(0, maxLines)
	const dataContent = dataPreviewLines.join('\n')

	return {
		schema: {
			content: schemaContent,
			totalLines: schemaTotalLines,
			truncated: schemaTruncated,
		},
		data: {
			content: dataContent,
			totalLines: dataTotalLines,
			truncated: dataTruncated,
		},
	}
}

/**
 * Delete a backup from Azure and database
 */
export async function deleteBackup(backupId: string): Promise<void> {
	const backup = await prisma.databaseBackup.findUnique({
		where: { id: backupId },
	})

	if (!backup) {
		throw new Error('Backup not found')
	}

	// Delete from Azure Blob Storage
	try {
		await deleteFile({
			containerName: BACKUP_CONTAINER,
			fileName: backup.fileName,
		})
	} catch (error) {
		console.error('Error deleting backup file from Azure:', error)
	}

	// Delete from database
	await prisma.databaseBackup.delete({
		where: { id: backupId },
	})
}

/**
 * Clean up old backups based on retention settings
 */
export async function cleanupOldBackups(): Promise<{ deleted: number }> {
	const retentionDays = await getSetting<number>(
		SettingKeys.BACKUP_RETENTION_DAYS
	)
	const maxCount = await getSetting<number>(SettingKeys.BACKUP_MAX_COUNT)

	const cutoffDate = new Date()
	cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

	const allBackups = await prisma.databaseBackup.findMany({
		where: { status: 'COMPLETED' },
		orderBy: { createdAt: 'desc' },
	})

	const backupsToDelete: DatabaseBackup[] = []

	// Mark backups beyond max count for deletion
	if (allBackups.length > maxCount) {
		backupsToDelete.push(...allBackups.slice(maxCount))
	}

	// Mark backups older than retention period for deletion
	for (const backup of allBackups) {
		if (
			backup.createdAt < cutoffDate &&
			!backupsToDelete.some(b => b.id === backup.id)
		) {
			backupsToDelete.push(backup)
		}
	}

	let deleted = 0
	for (const backup of backupsToDelete) {
		try {
			await deleteBackup(backup.id)
			deleted++
		} catch (error) {
			console.error(`Failed to delete backup ${backup.id}:`, error)
		}
	}

	return { deleted }
}

/**
 * Get backup statistics
 */
export async function getBackupStats(): Promise<{
	totalBackups: number
	totalSize: bigint
	lastBackupDate: Date | null
}> {
	const backups = await prisma.databaseBackup.findMany({
		where: { status: 'COMPLETED' },
		orderBy: { createdAt: 'desc' },
	})

	const totalSize = backups.reduce((sum, b) => sum + b.sizeBytes, 0n)
	const lastBackupDate = backups.length > 0 ? backups[0].createdAt : null

	return {
		totalBackups: backups.length,
		totalSize,
		lastBackupDate,
	}
}
