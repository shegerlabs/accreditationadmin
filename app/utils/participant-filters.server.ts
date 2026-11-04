import { Prisma } from '@prisma/client'
import {
	buildFilteredWhere,
	type FilterField,
	type SearchField,
} from '~/utils/db.server'

// The participants list and its exports share these, so an export contains
// exactly the rows the list shows for the same URL.
export const participantSearchFields: SearchField[] = [
	'id',
	'email',
	'organization',
	'registrationCode',
	'firstName',
	'familyName',
	{ tenant: 'name' },
	{ event: 'name' },
	{ participantType: 'name' },
	{ country: 'name' },
]

export const participantFilterFields: FilterField[] = [
	'participantTypeId',
	'status',
	'nationalityId',
	'organization',
	'tenantId',
	{ field: 'wishList', operator: 'array-contains' },
	{ field: 'attendClosedSession', isBoolean: true },
]

/** The `deleted` and `stage` filters, which aren't plain field filters. */
export function participantBaseWhere(
	url: URL,
	tenantFilter: Prisma.ParticipantWhereInput,
): Prisma.ParticipantWhereInput {
	const deletedFilter = url.searchParams.get('deleted') || 'active'
	const deletedCondition =
		deletedFilter === 'all'
			? {}
			: deletedFilter === 'deleted'
				? { deletedAt: { not: null } }
				: { deletedAt: null }

	const stageFilter = url.searchParams.get('stage') || 'all'
	const stageCondition =
		stageFilter === 'stuck'
			? { step: { name: { in: ['Request Received', 'Review Request'] } } }
			: {}

	return { ...tenantFilter, ...deletedCondition, ...stageCondition }
}

/**
 * The participants an export link covers: the rows ticked on the list
 * (`selectedIds`), or otherwise everything matching the list's search and
 * filters, across all pages.
 */
export function participantExportWhere(
	request: Request,
	tenantFilter: Prisma.ParticipantWhereInput,
): Prisma.ParticipantWhereInput {
	const url = new URL(request.url)
	const selectedIds = url.searchParams.get('selectedIds')
	if (selectedIds) {
		return {
			...tenantFilter,
			id: { in: selectedIds.split(',').filter(Boolean) },
		}
	}

	return buildFilteredWhere({
		url,
		searchFields: participantSearchFields,
		filterFields: participantFilterFields,
		where: participantBaseWhere(url, tenantFilter),
	})
}
