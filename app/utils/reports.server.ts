import { Prisma, RequestStatus } from '@prisma/client'
import { format, subDays } from 'date-fns'
import { prisma } from './db.server'

export type TenantFilter = {
	tenantId?: string
}

export type ReportFilters = {
	eventId?: string
	participantTypeId?: string
	countryId?: string
	status?: RequestStatus
	userId?: string
	startDate?: Date
	endDate?: Date
}

// ============================================================================
// PARTICIPANT SUMMARY REPORT
// ============================================================================

export async function getParticipantSummaryData(
	tenantFilter: TenantFilter,
	filters: ReportFilters,
) {
	const { eventId, participantTypeId, countryId, status, startDate, endDate } = filters

	// Filter out "all" values which come from the dropdown
	const effectiveEventId = eventId && eventId !== 'all' ? eventId : undefined
	const effectiveParticipantTypeId = participantTypeId && participantTypeId !== 'all' ? participantTypeId : undefined
	const effectiveCountryId = countryId && countryId !== 'all' ? countryId : undefined
	const effectiveStatus = status && status !== ('all' as never) ? status : undefined

	const whereClause: Prisma.ParticipantWhereInput = {
		...tenantFilter,
		deletedAt: null,
		...(effectiveEventId && { eventId: effectiveEventId }),
		...(effectiveParticipantTypeId && { participantTypeId: effectiveParticipantTypeId }),
		...(effectiveCountryId && { nationalityId: effectiveCountryId }),
		...(effectiveStatus && { status: effectiveStatus }),
		...(startDate && endDate && {
			createdAt: {
				gte: startDate,
				lte: endDate,
			},
		}),
	}

	// Get counts by status
	const statusCounts = await prisma.participant.groupBy({
		by: ['status'],
		_count: true,
		where: whereClause,
	})

	// Get counts by participant type
	const typeCounts = await prisma.participant.groupBy({
		by: ['participantTypeId'],
		_count: true,
		where: whereClause,
	})

	const typeDetails = await Promise.all(
		typeCounts.map(async tc => {
			const type = await prisma.participantType.findUnique({
				where: { id: tc.participantTypeId },
				select: { name: true },
			})
			return {
				name: type?.name ?? 'Unknown',
				count: tc._count,
			}
		}),
	)

	// Get counts by country/nationality
	const countryCounts = await prisma.participant.groupBy({
		by: ['nationalityId'],
		_count: true,
		where: whereClause,
		orderBy: {
			_count: {
				nationalityId: 'desc',
			},
		},
		take: 20,
	})

	const countryDetails = await Promise.all(
		countryCounts.map(async cc => {
			const country = await prisma.country.findUnique({
				where: { id: cc.nationalityId },
				select: { name: true },
			})
			return {
				name: country?.name ?? 'Unknown',
				count: cc._count,
			}
		}),
	)

	// Get counts by event (useful for multi-event management)
	const eventCounts = await prisma.participant.groupBy({
		by: ['eventId'],
		_count: true,
		where: whereClause,
		orderBy: {
			_count: {
				eventId: 'desc',
			},
		},
	})

	const eventDetails = await Promise.all(
		eventCounts.map(async ec => {
			const event = await prisma.event.findUnique({
				where: { id: ec.eventId },
				select: { name: true },
			})
			return {
				name: event?.name ?? 'Unknown',
				count: ec._count,
			}
		}),
	)

	// Get counts by organization (top 15)
	const organizationCounts = await prisma.participant.groupBy({
		by: ['organization'],
		_count: true,
		where: whereClause,
		orderBy: {
			_count: {
				organization: 'desc',
			},
		},
		take: 15,
	})

	const organizationDetails = organizationCounts.map(oc => ({
		name: oc.organization || 'Unknown',
		count: oc._count,
	}))

	// Get registration trends (daily for last 30 days or custom range)
	const trendStartDate = startDate ?? subDays(new Date(), 30)
	const trendEndDate = endDate ?? new Date()

	const registrationTrends = await prisma.$queryRaw<
		{ date: Date; count: bigint }[]
	>`
		SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
		FROM "Participant"
		WHERE "deletedAt" IS NULL
		  AND "createdAt" >= ${trendStartDate}
		  AND "createdAt" <= ${trendEndDate}
		  ${tenantFilter.tenantId ? Prisma.sql`AND "tenantId" = ${tenantFilter.tenantId}` : Prisma.empty}
		  ${effectiveEventId ? Prisma.sql`AND "eventId" = ${effectiveEventId}` : Prisma.empty}
		GROUP BY DATE("createdAt")
		ORDER BY date ASC
	`

	// Total count
	const totalCount = await prisma.participant.count({ where: whereClause })

	// Participant list for table preview
	const participants = await prisma.participant.findMany({
		where: whereClause,
		take: 100,
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			registrationCode: true,
			firstName: true,
			familyName: true,
			organization: true,
			status: true,
			createdAt: true,
			participantType: { select: { name: true } },
			nationality: { select: { name: true } },
			event: { select: { name: true } },
		},
	})

	// Calculate completion metrics
	const printedCount = statusCounts.find(s => s.status === 'PRINTED')?._count ?? 0
	const collectedCount = statusCounts.find(s => s.status === 'COLLECTED')?._count ?? 0
	const rejectedCount = statusCounts.find(s => s.status === 'REJECTED')?._count ?? 0
	const completedCount = printedCount + collectedCount
	const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
	const rejectionRate = totalCount > 0 ? Math.round((rejectedCount / totalCount) * 100) : 0

	return {
		summary: {
			total: totalCount,
			printed: printedCount,
			collected: collectedCount,
			rejected: rejectedCount,
			completionRate,
			rejectionRate,
			byStatus: statusCounts.map(sc => ({
				status: sc.status,
				count: sc._count,
			})),
			byType: typeDetails,
			byCountry: countryDetails,
			byEvent: eventDetails,
			byOrganization: organizationDetails,
		},
		trends: registrationTrends.map(t => ({
			date: format(new Date(t.date), 'MMM dd'),
			count: Number(t.count),
		})),
		participants: participants.map(p => ({
			id: p.id,
			registrationCode: p.registrationCode,
			name: `${p.firstName} ${p.familyName}`,
			organization: p.organization,
			status: p.status,
			type: p.participantType.name,
			nationality: p.nationality.name,
			event: p.event.name,
			createdAt: format(new Date(p.createdAt), 'MMM dd, yyyy'),
		})),
	}
}

// ============================================================================
// WORKFLOW PERFORMANCE REPORT
// ============================================================================

export async function getWorkflowPerformanceData(
	tenantFilter: TenantFilter,
	filters: ReportFilters,
) {
	const { eventId, startDate, endDate } = filters

	// Filter out "all" values which come from the dropdown
	const effectiveEventId = eventId && eventId !== 'all' ? eventId : undefined

	// Get approvals with step info for processing time calculation
	const approvalWhereClause: Prisma.ApprovalWhereInput = {
		step: {
			workflow: {
				...(effectiveEventId && { eventId: effectiveEventId }),
				...(tenantFilter.tenantId && { tenantId: tenantFilter.tenantId }),
			},
		},
		...(startDate && endDate && {
			createdAt: {
				gte: startDate,
				lte: endDate,
			},
		}),
	}

	// Get approval/rejection rates by step
	const stepStats = await prisma.approval.groupBy({
		by: ['stepId', 'result'],
		_count: true,
		where: approvalWhereClause,
	})

	// Get step details
	const stepIds = [...new Set(stepStats.map(s => s.stepId))]
	const steps = await prisma.step.findMany({
		where: { id: { in: stepIds } },
		select: {
			id: true,
			name: true,
			action: true,
			slaDurationMinutes: true,
			workflow: {
				select: { name: true },
			},
		},
	})

	const stepMap = new Map(steps.map(s => [s.id, s]))

	// Calculate processing times per step (difference between consecutive approvals)
	const processingTimeData = await prisma.$queryRaw<
		{ step_id: string; avg_time_minutes: number }[]
	>`
		WITH approval_times AS (
			SELECT
				a."stepId" as step_id,
				a."participantId",
				a."createdAt",
				LAG(a."createdAt") OVER (
					PARTITION BY a."participantId"
					ORDER BY a."createdAt"
				) as prev_approval_time
			FROM "Approval" a
			JOIN "Step" s ON a."stepId" = s.id
			JOIN "Workflow" w ON s."workflowId" = w.id
			WHERE w."tenantId" = ${tenantFilter.tenantId ?? ''}
			${effectiveEventId ? Prisma.sql`AND w."eventId" = ${effectiveEventId}` : Prisma.empty}
		)
		SELECT
			step_id,
			AVG(EXTRACT(EPOCH FROM ("createdAt" - prev_approval_time)) / 60)::float as avg_time_minutes
		FROM approval_times
		WHERE prev_approval_time IS NOT NULL
		GROUP BY step_id
	`

	// Build step performance data
	const stepPerformance = steps.map(step => {
		const stats = stepStats.filter(s => s.stepId === step.id)
		const approved = stats.find(s => s.result === 'SUCCESS')?._count ?? 0
		const rejected = stats.find(s => s.result === 'FAILURE')?._count ?? 0
		const total = approved + rejected
		const processingTime =
			processingTimeData.find(p => p.step_id === step.id)?.avg_time_minutes ?? 0

		// SLA compliance (if SLA is defined)
		let slaCompliance = null
		if (step.slaDurationMinutes) {
			const withinSla = processingTime <= step.slaDurationMinutes
			slaCompliance = {
				target: step.slaDurationMinutes,
				actual: Math.round(processingTime),
				compliant: withinSla,
			}
		}

		return {
			stepId: step.id,
			stepName: step.name,
			action: step.action,
			workflowName: step.workflow.name,
			approved,
			rejected,
			total,
			approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
			avgProcessingTimeMinutes: Math.round(processingTime),
			slaCompliance,
		}
	})

	// Identify bottlenecks (steps with longest wait times)
	const bottlenecks = [...stepPerformance]
		.sort((a, b) => b.avgProcessingTimeMinutes - a.avgProcessingTimeMinutes)
		.slice(0, 5)

	// Overall statistics
	const totalApprovals = stepPerformance.reduce((sum, s) => sum + s.total, 0)
	const totalApproved = stepPerformance.reduce((sum, s) => sum + s.approved, 0)
	const overallApprovalRate =
		totalApprovals > 0 ? Math.round((totalApproved / totalApprovals) * 100) : 0

	return {
		summary: {
			totalActions: totalApprovals,
			overallApprovalRate,
			stepsWithSla: steps.filter(s => s.slaDurationMinutes).length,
		},
		stepPerformance,
		bottlenecks,
	}
}

// ============================================================================
// EVENT OVERVIEW REPORT
// ============================================================================

export async function getEventOverviewData(
	tenantFilter: TenantFilter,
	filters: ReportFilters,
) {
	const { eventId, startDate, endDate } = filters

	// Filter out "all" values which come from the dropdown
	const effectiveEventId = eventId && eventId !== 'all' ? eventId : undefined

	if (!effectiveEventId) {
		return {
			event: null,
			summary: null,
			trends: [],
			typeBreakdown: [],
			stageDistribution: [],
			invitationUsage: [],
		}
	}

	// Get event details
	const event = await prisma.event.findUnique({
		where: { id: effectiveEventId },
		select: {
			id: true,
			name: true,
			status: true,
			startDate: true,
			endDate: true,
		},
	})

	if (!event) {
		return {
			event: null,
			summary: null,
			trends: [],
			typeBreakdown: [],
			stageDistribution: [],
			invitationUsage: [],
		}
	}

	// Get participant counts
	const participantCount = await prisma.participant.count({
		where: {
			eventId: effectiveEventId,
			deletedAt: null,
		},
	})

	// Get total quota from invitations
	const invitations = await prisma.invitation.findMany({
		where: { eventId: effectiveEventId },
		select: {
			maximumQuota: true,
			invitationConstraints: {
				select: { quota: true },
			},
		},
	})

	const totalQuota = invitations.reduce((sum, inv) => {
		const constraintQuota = inv.invitationConstraints.reduce(
			(cSum, c) => cSum + (c.quota ?? 0),
			0,
		)
		return sum + (inv.maximumQuota ?? constraintQuota)
	}, 0)

	// Daily registration trends
	const trendStartDate = startDate ?? event.startDate
	const trendEndDate = endDate ?? new Date()

	const dailyTrends = await prisma.$queryRaw<{ date: Date; count: bigint }[]>`
		SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
		FROM "Participant"
		WHERE "eventId" = ${effectiveEventId}
		  AND "deletedAt" IS NULL
		  AND "createdAt" >= ${trendStartDate}
		  AND "createdAt" <= ${trendEndDate}
		GROUP BY DATE("createdAt")
		ORDER BY date ASC
	`

	// Type breakdown
	const typeBreakdown = await prisma.participant.groupBy({
		by: ['participantTypeId'],
		_count: true,
		where: {
			eventId: effectiveEventId,
			deletedAt: null,
		},
	})

	const typeDetails = await Promise.all(
		typeBreakdown.map(async tb => {
			const type = await prisma.participantType.findUnique({
				where: { id: tb.participantTypeId },
				select: { name: true },
			})
			return {
				name: type?.name ?? 'Unknown',
				count: tb._count,
			}
		}),
	)

	// Stage distribution (by step)
	const stageDistribution = await prisma.participant.groupBy({
		by: ['stepId', 'status'],
		_count: true,
		where: {
			eventId: effectiveEventId,
			deletedAt: null,
		},
	})

	const stepIds = [...new Set(stageDistribution.map(s => s.stepId))]
	const stepDetails = await prisma.step.findMany({
		where: { id: { in: stepIds } },
		select: { id: true, name: true, action: true },
	})

	const stageDetails = stepDetails.map(step => {
		const counts = stageDistribution.filter(s => s.stepId === step.id)
		const total = counts.reduce((sum, c) => sum + c._count, 0)
		return {
			stepName: step.name,
			action: step.action,
			count: total,
		}
	})

	// Invitation usage summary
	const invitationUsage = await prisma.invitation.findMany({
		where: { eventId: effectiveEventId },
		select: {
			id: true,
			organization: true,
			maximumQuota: true,
			_count: {
				select: { participants: { where: { deletedAt: null } } },
			},
			invitationConstraints: {
				select: {
					quota: true,
					participantType: { select: { name: true } },
					accessLevel: true,
				},
			},
		},
		orderBy: { organization: 'asc' },
		take: 20,
	})

	return {
		event: {
			id: event.id,
			name: event.name,
			status: event.status,
			startDate: format(new Date(event.startDate), 'MMM dd, yyyy'),
			endDate: format(new Date(event.endDate), 'MMM dd, yyyy'),
		},
		summary: {
			registrationCount: participantCount,
			quotaCapacity: totalQuota,
			usagePercentage:
				totalQuota > 0 ? Math.round((participantCount / totalQuota) * 100) : 0,
		},
		trends: dailyTrends.map(t => ({
			date: format(new Date(t.date), 'MMM dd'),
			count: Number(t.count),
		})),
		typeBreakdown: typeDetails,
		stageDistribution: stageDetails,
		invitationUsage: invitationUsage.map(inv => ({
			organization: inv.organization,
			quota: inv.maximumQuota,
			used: inv._count.participants,
			remaining:
				inv.maximumQuota !== null
					? inv.maximumQuota - inv._count.participants
					: null,
		})),
	}
}

// ============================================================================
// VALIDATOR ACTIVITY REPORT
// ============================================================================

export async function getValidatorActivityData(
	tenantFilter: TenantFilter,
	filters: ReportFilters,
) {
	const { eventId, userId, startDate, endDate } = filters

	// Filter out "all" values which come from the dropdown
	const effectiveEventId = eventId && eventId !== 'all' ? eventId : undefined
	const effectiveUserId = userId && userId !== 'all' ? userId : undefined

	// Get validators from UserEventAccess table (users who have been granted event access)
	const eventAccessWhere: Prisma.UserEventAccessWhereInput = {
		...(effectiveEventId && { eventId: effectiveEventId }),
		...(tenantFilter.tenantId && {
			event: { tenantId: tenantFilter.tenantId },
		}),
		...(effectiveUserId && { userId: effectiveUserId }),
	}

	const eventAccess = await prisma.userEventAccess.findMany({
		where: eventAccessWhere,
		select: {
			userId: true,
			user: { select: { id: true, name: true, username: true } },
		},
		distinct: ['userId'],
	})

	const validatorUserIds = eventAccess.map(ea => ea.userId)
	const userMap = new Map(eventAccess.map(ea => [ea.userId, ea.user]))

	// If no validators found, return empty data
	if (validatorUserIds.length === 0) {
		return {
			summary: {
				totalValidators: 0,
				totalActions: 0,
			},
			validatorActivity: [],
		}
	}

	// Now get approval stats only for these validators
	const approvalWhereClause: Prisma.ApprovalWhereInput = {
		userId: { in: validatorUserIds },
		step: {
			workflow: {
				...(effectiveEventId && { eventId: effectiveEventId }),
				...(tenantFilter.tenantId && { tenantId: tenantFilter.tenantId }),
			},
		},
		...(startDate && endDate && {
			createdAt: {
				gte: startDate,
				lte: endDate,
			},
		}),
	}

	// Actions per validator
	const userStats = await prisma.approval.groupBy({
		by: ['userId', 'action'],
		_count: true,
		where: approvalWhereClause,
	})

	// Group by user
	const userActivityMap = new Map<
		string,
		{ name: string; actions: Record<string, number>; total: number }
	>()

	for (const stat of userStats) {
		const user = userMap.get(stat.userId)
		if (!user) continue

		if (!userActivityMap.has(stat.userId)) {
			userActivityMap.set(stat.userId, {
				name: user.name ?? user.username,
				actions: {},
				total: 0,
			})
		}

		const entry = userActivityMap.get(stat.userId)!
		entry.actions[stat.action] = (entry.actions[stat.action] ?? 0) + stat._count
		entry.total += stat._count
	}

	const validatorActivity = Array.from(userActivityMap.values()).sort(
		(a, b) => b.total - a.total,
	)

	return {
		summary: {
			totalValidators: validatorActivity.length,
			totalActions: validatorActivity.reduce((sum, v) => sum + v.total, 0),
		},
		validatorActivity,
	}
}

// ============================================================================
// INVITATION USAGE REPORT
// ============================================================================

export async function getInvitationUsageData(
	tenantFilter: TenantFilter,
	filters: ReportFilters,
) {
	const { eventId } = filters

	// Filter out "all" values which come from the dropdown
	const effectiveEventId = eventId && eventId !== 'all' ? eventId : undefined

	const invitationWhereClause: Prisma.InvitationWhereInput = {
		...tenantFilter,
		...(effectiveEventId && { eventId: effectiveEventId }),
	}

	// Get all invitations with usage counts
	const invitations = await prisma.invitation.findMany({
		where: invitationWhereClause,
		select: {
			id: true,
			organization: true,
			email: true,
			maximumQuota: true,
			event: { select: { name: true } },
			participantType: { select: { id: true, name: true } },
			restriction: { select: { name: true } },
			invitationConstraints: {
				select: {
					id: true,
					quota: true,
					accessLevel: true,
					participantType: { select: { id: true, name: true } },
				},
			},
			participants: {
				where: { deletedAt: null },
				select: {
					participantTypeId: true,
					attendClosedSession: true,
				},
			},
		},
		orderBy: { organization: 'asc' },
	})

	// Process invitation data - one row per constraint
	const constraintRows: Array<{
		id: string
		invitationId: string
		organization: string
		email: string
		event: string
		participantType: string
		accessLevel: string
		restriction: string
		quota: number
		used: number
		remaining: number
		usagePercentage: number
	}> = []

	let totalUsed = 0
	let totalQuotaSum = 0
	let hasAnyUnlimited = false

	for (const inv of invitations) {
		// If invitation has constraints, create a row for each
		if (inv.invitationConstraints.length > 0) {
			for (const constraint of inv.invitationConstraints) {
				// Count participants for this constraint
				// Must match both participant type AND access level
				const isAnyType = constraint.participantType.name === 'Any'
				const isClosedAccess = constraint.accessLevel === 'CLOSED'

				const usedCount = inv.participants.filter(p => {
					// Check participant type: "Any" matches all types, otherwise exact match
					const typeMatches =
						isAnyType || p.participantTypeId === constraint.participantType.id

					// Check access level: CLOSED constraints count closed session participants,
					// OPEN constraints count non-closed session participants
					const accessMatches = isClosedAccess
						? p.attendClosedSession === true
						: p.attendClosedSession !== true

					return typeMatches && accessMatches
				}).length

				const quota = constraint.quota ?? 0
				const isUnlimited = !quota || quota === 0
				const remaining = isUnlimited ? 0 : quota - usedCount
				const usagePercentage = isUnlimited
					? 0
					: Math.round((usedCount / quota) * 100)

				if (isUnlimited) {
					hasAnyUnlimited = true
				} else {
					totalQuotaSum += quota
				}
				totalUsed += usedCount

				constraintRows.push({
					id: constraint.id,
					invitationId: inv.id,
					organization: inv.organization,
					email: inv.email,
					event: inv.event.name,
					participantType: constraint.participantType.name,
					accessLevel: constraint.accessLevel,
					restriction: inv.restriction?.name ?? 'None',
					quota,
					used: usedCount,
					remaining,
					usagePercentage,
				})
			}
		} else {
			// No constraints - use the invitation's participantType and maximumQuota
			const usedCount = inv.participants.length
			const quota = inv.maximumQuota ?? 0
			const isUnlimited = !quota || quota === 0
			const remaining = isUnlimited ? 0 : quota - usedCount
			const usagePercentage = isUnlimited
				? 0
				: Math.round((usedCount / quota) * 100)

			if (isUnlimited) {
				hasAnyUnlimited = true
			} else {
				totalQuotaSum += quota
			}
			totalUsed += usedCount

			constraintRows.push({
				id: inv.id,
				invitationId: inv.id,
				organization: inv.organization,
				email: inv.email,
				event: inv.event.name,
				participantType: inv.participantType?.name ?? 'Any',
				accessLevel: 'OPEN',
				restriction: inv.restriction?.name ?? 'None',
				quota,
				used: usedCount,
				remaining,
				usagePercentage,
			})
		}
	}

	// Find unused invitations (no participants at all)
	const unusedInvitations = invitations
		.filter(inv => inv.participants.length === 0)
		.map(inv => ({
			organization: inv.organization,
			email: inv.email,
			quota: inv.maximumQuota ?? 0,
		}))

	// Calculate summary stats
	const overallUsagePercentage = hasAnyUnlimited
		? 0
		: totalQuotaSum > 0
			? Math.round((totalUsed / totalQuotaSum) * 100)
			: 0

	return {
		summary: {
			totalInvitations: invitations.length,
			totalQuota: totalQuotaSum,
			totalUsed,
			totalRemaining: totalQuotaSum - totalUsed,
			overallUsagePercentage,
			unusedInvitationsCount: unusedInvitations.length,
			hasUnlimitedQuotas: hasAnyUnlimited,
		},
		invitations: constraintRows,
		unusedInvitations,
	}
}
