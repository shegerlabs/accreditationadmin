// Dynamic query builder for Custom Reports
// Builds Prisma queries from report configurations

import { Prisma } from '@prisma/client'
import { format } from 'date-fns'
import { prisma } from './db.server'
import type {
	CustomReportConfig,
	DataSourceType,
	FieldType,
	ReportFilter,
	ReportResult,
} from './custom-report-types'
import { getFieldDefinition, getFieldsForDataSource } from './custom-report-schema'

// Max rows to return for safety
const MAX_ROWS = 1000
const QUERY_TIMEOUT_MS = 30000

type TenantFilter = {
	tenantId?: string
}

// Build select object from field paths
function buildSelect(
	dataSource: DataSourceType,
	fieldPaths: string[],
): Record<string, unknown> {
	const select: Record<string, unknown> = {}

	for (const path of fieldPaths) {
		const parts = path.split('.')

		if (parts.length === 1) {
			// Direct field
			select[parts[0]] = true
		} else if (parts.length === 2) {
			// Relation field (e.g., participantType.name)
			const [relation, field] = parts
			if (!select[relation]) {
				select[relation] = { select: {} }
			}
			;(select[relation] as { select: Record<string, boolean> }).select[field] =
				true
		}
	}

	return select
}

// Build where clause from filters
function buildWhere(
	dataSource: DataSourceType,
	filters: ReportFilter[],
	tenantFilter: TenantFilter,
): Record<string, unknown> {
	const where: Record<string, unknown> = {
		...tenantFilter,
	}

	// Add deletedAt filter for Participant
	if (dataSource === 'Participant') {
		where.deletedAt = null
	}

	for (const filter of filters) {
		const fieldDef = getFieldDefinition(dataSource, filter.field)
		if (!fieldDef) continue

		const parts = filter.field.split('.')
		let condition: unknown

		// Build the condition based on operator
		switch (filter.operator) {
			case 'equals':
				condition = parseValue(filter.value, fieldDef.type)
				break
			case 'not':
				condition = { not: parseValue(filter.value, fieldDef.type) }
				break
			case 'contains':
				condition = { contains: filter.value, mode: 'insensitive' }
				break
			case 'startsWith':
				condition = { startsWith: filter.value, mode: 'insensitive' }
				break
			case 'endsWith':
				condition = { endsWith: filter.value, mode: 'insensitive' }
				break
			case 'gt':
				condition = { gt: parseValue(filter.value, fieldDef.type) }
				break
			case 'gte':
				condition = { gte: parseValue(filter.value, fieldDef.type) }
				break
			case 'lt':
				condition = { lt: parseValue(filter.value, fieldDef.type) }
				break
			case 'lte':
				condition = { lte: parseValue(filter.value, fieldDef.type) }
				break
			case 'in':
				condition = {
					in: Array.isArray(filter.value)
						? filter.value
						: [filter.value],
				}
				break
			case 'notIn':
				condition = {
					notIn: Array.isArray(filter.value)
						? filter.value
						: [filter.value],
				}
				break
			case 'isNull':
				condition = null
				break
			case 'isNotNull':
				condition = { not: null }
				break
			default:
				continue
		}

		if (parts.length === 1) {
			// Direct field
			where[parts[0]] = condition
		} else if (parts.length === 2) {
			// Relation field
			const [relation, field] = parts
			if (!where[relation]) {
				where[relation] = {}
			}
			;(where[relation] as Record<string, unknown>)[field] = condition
		}
	}

	return where
}

// Parse value based on field type
function parseValue(value: unknown, type: FieldType): unknown {
	if (value === null || value === undefined) return null

	switch (type) {
		case 'number':
			return typeof value === 'string' ? parseFloat(value) : value
		case 'boolean':
			return value === true || value === 'true'
		case 'date':
			return typeof value === 'string' ? new Date(value) : value
		default:
			return value
	}
}

// Build orderBy from sorting config
function buildOrderBy(
	sorting: { field: string; direction: 'asc' | 'desc' }[],
): Record<string, unknown>[] {
	const orderBy: Record<string, unknown>[] = []

	for (const sort of sorting) {
		const parts = sort.field.split('.')

		if (parts.length === 1) {
			orderBy.push({ [parts[0]]: sort.direction })
		} else if (parts.length === 2) {
			const [relation, field] = parts
			orderBy.push({ [relation]: { [field]: sort.direction } })
		}
	}

	// Default ordering if none specified
	if (orderBy.length === 0) {
		orderBy.push({ createdAt: 'desc' })
	}

	return orderBy
}

// Flatten nested results to single level object
function flattenRow(
	row: Record<string, unknown>,
	fieldPaths: string[],
): Record<string, unknown> {
	const flat: Record<string, unknown> = {}

	for (const path of fieldPaths) {
		const parts = path.split('.')
		let value: unknown = row

		for (const part of parts) {
			if (value && typeof value === 'object') {
				value = (value as Record<string, unknown>)[part]
			} else {
				value = null
				break
			}
		}

		flat[path] = value
	}

	return flat
}

// Format value for display
function formatValue(value: unknown, type: FieldType): string {
	if (value === null || value === undefined) return ''

	switch (type) {
		case 'date':
			if (value instanceof Date) {
				return format(value, 'MMM dd, yyyy HH:mm')
			}
			if (typeof value === 'string') {
				return format(new Date(value), 'MMM dd, yyyy HH:mm')
			}
			return String(value)
		case 'boolean':
			return value ? 'Yes' : 'No'
		default:
			return String(value)
	}
}

// Execute a custom report query
export async function executeCustomReport(
	config: CustomReportConfig,
	tenantFilter: TenantFilter,
): Promise<ReportResult> {
	const startTime = Date.now()
	const fieldPaths = config.fields.map((f) => f.path)

	// Get computed field source paths
	const computedFieldSources = new Set<string>()
	if (config.computedFields) {
		for (const cf of config.computedFields) {
			for (const fieldPath of cf.fields) {
				computedFieldSources.add(fieldPath)
			}
		}
	}

	// Combine regular fields and computed field sources for the query
	const allFieldPaths = [
		...new Set([...fieldPaths, ...computedFieldSources]),
	]

	// Validate fields
	const allowedFields = getFieldsForDataSource(config.dataSource).map(
		(f) => f.path,
	)
	for (const path of allFieldPaths) {
		if (!allowedFields.includes(path)) {
			throw new Error(`Invalid field: ${path}`)
		}
	}

	// Build query components
	const select = buildSelect(config.dataSource, allFieldPaths)
	const where = buildWhere(config.dataSource, config.filters, tenantFilter)
	const orderBy = buildOrderBy(config.sorting)
	const limit = Math.min(config.limit || MAX_ROWS, MAX_ROWS)

	// Execute query based on data source
	let rows: Record<string, unknown>[]
	let totalCount: number

	const queryArgs = {
		where,
		select,
		orderBy,
		take: limit,
	}

	switch (config.dataSource) {
		case 'Participant':
			[rows, totalCount] = await Promise.all([
				prisma.participant.findMany(queryArgs as Prisma.ParticipantFindManyArgs),
				prisma.participant.count({ where: where as Prisma.ParticipantWhereInput }),
			])
			break

		case 'Invitation':
			[rows, totalCount] = await Promise.all([
				prisma.invitation.findMany(queryArgs as Prisma.InvitationFindManyArgs),
				prisma.invitation.count({ where: where as Prisma.InvitationWhereInput }),
			])
			break

		case 'AuditLog':
			[rows, totalCount] = await Promise.all([
				prisma.auditLog.findMany(queryArgs as Prisma.AuditLogFindManyArgs),
				prisma.auditLog.count({ where: where as Prisma.AuditLogWhereInput }),
			])
			break

		case 'ParticipantType':
			[rows, totalCount] = await Promise.all([
				prisma.participantType.findMany(queryArgs as Prisma.ParticipantTypeFindManyArgs),
				prisma.participantType.count({ where: where as Prisma.ParticipantTypeWhereInput }),
			])
			break

		case 'Country':
			// Country has no tenantId, remove tenant filter
			delete (where as Record<string, unknown>).tenantId;
			[rows, totalCount] = await Promise.all([
				prisma.country.findMany(queryArgs as Prisma.CountryFindManyArgs),
				prisma.country.count({ where: where as Prisma.CountryWhereInput }),
			])
			break

		case 'Restriction':
			[rows, totalCount] = await Promise.all([
				prisma.restriction.findMany(queryArgs as Prisma.RestrictionFindManyArgs),
				prisma.restriction.count({ where: where as Prisma.RestrictionWhereInput }),
			])
			break

		default:
			throw new Error(`Unsupported data source: ${config.dataSource}`)
	}

	// Build columns metadata
	// If fieldOrder is provided, use it to determine column order
	// Otherwise fall back to fields order + computed fields at end
	const columns: { key: string; label: string; type: FieldType }[] = []

	if (config.fieldOrder && config.fieldOrder.length > 0) {
		// Use fieldOrder to build columns in the specified order
		for (const key of config.fieldOrder) {
			if (key.startsWith('computed_')) {
				// Computed field
				const cf = config.computedFields?.find((f) => `computed_${f.id}` === key)
				if (cf) {
					columns.push({
						key: `computed_${cf.id}`,
						label: cf.name,
						type: 'string' as FieldType,
					})
				}
			} else {
				// Regular field - skip if it's a source for a computed field
				if (!computedFieldSources.has(key)) {
					const field = config.fields.find((f) => f.path === key)
					if (field) {
						const fieldDef = getFieldDefinition(config.dataSource, field.path)
						columns.push({
							key: field.path,
							label: field.alias || fieldDef?.label || field.path,
							type: fieldDef?.type || 'string',
						})
					}
				}
			}
		}
	} else {
		// Fall back to original behavior: fields first, then computed fields
		for (const f of config.fields) {
			if (!computedFieldSources.has(f.path)) {
				const fieldDef = getFieldDefinition(config.dataSource, f.path)
				columns.push({
					key: f.path,
					label: f.alias || fieldDef?.label || f.path,
					type: fieldDef?.type || 'string',
				})
			}
		}
		if (config.computedFields) {
			for (const cf of config.computedFields) {
				columns.push({
					key: `computed_${cf.id}`,
					label: cf.name,
					type: 'string' as FieldType,
				})
			}
		}
	}

	// Flatten and format rows
	const flattenedRows = rows.map((row) => {
		const flat = flattenRow(row, allFieldPaths)

		// Format values for display
		const formatted: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(flat)) {
			const fieldDef = getFieldDefinition(config.dataSource, key)
			formatted[key] = fieldDef
				? formatValue(value, fieldDef.type)
				: value
		}

		// Calculate computed field values
		if (config.computedFields) {
			for (const cf of config.computedFields) {
				const values = cf.fields
					.map((fieldPath) => {
						const val = flat[fieldPath]
						return val !== null && val !== undefined ? String(val) : ''
					})
					.filter((v) => v !== '')
				formatted[`computed_${cf.id}`] = values.join(cf.separator)
			}
		}

		return formatted
	})

	const executionTimeMs = Date.now() - startTime

	return {
		columns,
		rows: flattenedRows,
		totalCount,
		executionTimeMs,
	}
}

// Execute report with grouping and aggregations
export async function executeGroupedReport(
	config: CustomReportConfig,
	tenantFilter: TenantFilter,
): Promise<ReportResult> {
	const startTime = Date.now()

	if (!config.groupBy || config.groupBy.length === 0) {
		return executeCustomReport(config, tenantFilter)
	}

	// For grouped reports, we need to use raw SQL or groupBy
	// This is a simplified version - for complex aggregations, use raw SQL
	const where = buildWhere(config.dataSource, config.filters, tenantFilter)

	// Build groupBy args dynamically
	const groupByArgs: Record<string, unknown> = {
		by: config.groupBy,
		_count: true,
		where,
	}

	// Add numeric aggregations if specified
	if (config.aggregations) {
		for (const agg of config.aggregations) {
			if (agg.type !== 'count') {
				const aggKey = `_${agg.type}`
				if (!groupByArgs[aggKey]) {
					groupByArgs[aggKey] = {}
				}
				;(groupByArgs[aggKey] as Record<string, boolean>)[agg.field] = true
			}
		}
	}

	// Execute groupBy query - using any to avoid complex type issues with dynamic groupBy
	let rows: Array<Record<string, unknown>>
	const totalCount = 0

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const executeGroupBy = async (model: any) => {
		return model.groupBy(groupByArgs) as Promise<Array<Record<string, unknown>>>
	}

	switch (config.dataSource) {
		case 'Participant':
			rows = await executeGroupBy(prisma.participant)
			break

		case 'Invitation':
			rows = await executeGroupBy(prisma.invitation)
			break

		case 'AuditLog':
			rows = await executeGroupBy(prisma.auditLog)
			break

		case 'ParticipantType':
			rows = await executeGroupBy(prisma.participantType)
			break

		case 'Country':
			rows = await executeGroupBy(prisma.country)
			break

		case 'Restriction':
			rows = await executeGroupBy(prisma.restriction)
			break

		default:
			throw new Error(`Unsupported data source: ${config.dataSource}`)
	}

	// Build columns for grouped result
	const columns = [
		...config.groupBy.map((field) => {
			const fieldDef = getFieldDefinition(config.dataSource, field)
			return {
				key: field,
				label: fieldDef?.label || field,
				type: fieldDef?.type || ('string' as FieldType),
			}
		}),
		...(config.aggregations || [{ type: 'count', field: 'id', alias: 'Count' }]).map(
			(agg) => ({
				key: agg.alias || `${agg.type}_${agg.field}`,
				label: agg.alias || `${agg.type.toUpperCase()}(${agg.field})`,
				type: 'number' as FieldType,
			}),
		),
	]

	// Transform grouped results
	const transformedRows = rows.map((row: Record<string, unknown>) => {
		const transformed: Record<string, unknown> = {}

		// Add group by fields
		for (const field of config.groupBy!) {
			const fieldDef = getFieldDefinition(config.dataSource, field)
			transformed[field] = fieldDef
				? formatValue(row[field], fieldDef.type)
				: row[field]
		}

		// Add aggregation results
		if (row._count !== undefined) {
			transformed['count'] =
				typeof row._count === 'object'
					? Object.values(row._count as object)[0]
					: row._count
		}
		for (const agg of config.aggregations || []) {
			const aggKey = `_${agg.type}`
			if (row[aggKey]) {
				const aggResult = row[aggKey] as Record<string, number>
				transformed[agg.alias || `${agg.type}_${agg.field}`] = aggResult[agg.field]
			}
		}

		return transformed
	})

	const executionTimeMs = Date.now() - startTime

	return {
		columns,
		rows: transformedRows,
		totalCount: transformedRows.length,
		executionTimeMs,
	}
}

// Get preview data for report builder (limited rows)
export async function getReportPreview(
	config: CustomReportConfig,
	tenantFilter: TenantFilter,
	limit = 10,
): Promise<ReportResult> {
	const limitedConfig = { ...config, limit }

	if (config.groupBy && config.groupBy.length > 0) {
		return executeGroupedReport(limitedConfig, tenantFilter)
	}

	return executeCustomReport(limitedConfig, tenantFilter)
}

// Prepare data for export (all rows up to MAX_ROWS)
export async function getReportExportData(
	config: CustomReportConfig,
	tenantFilter: TenantFilter,
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
	const result = config.groupBy?.length
		? await executeGroupedReport(config, tenantFilter)
		: await executeCustomReport(config, tenantFilter)

	return {
		headers: result.columns.map((c) => c.label),
		rows: result.rows,
	}
}
