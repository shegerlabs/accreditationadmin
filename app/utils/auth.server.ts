import {
	AuditAction,
	AuditEntityType,
	Password,
	RoleScope,
	User,
} from '@prisma/client'
import { json, redirect } from '@remix-run/node'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { addMinutes, isBefore } from 'date-fns'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { createAuditLog, getClientIp, getUserAgent } from './audit.server'
import { prisma } from './db.server'
import { getSetting, SettingKeys } from './settings.server'

// Helper to load auth settings
async function getAuthSettings() {
	const [maxLoginAttempts, lockoutDuration, autoResetAfter, maxLockCount] = await Promise.all([
		getSetting<number>(SettingKeys.AUTH_MAX_LOGIN_ATTEMPTS),
		getSetting<number>(SettingKeys.AUTH_LOCKOUT_DURATION_MINUTES),
		getSetting<number>(SettingKeys.AUTH_AUTO_RESET_AFTER_MINUTES),
		getSetting<number>(SettingKeys.AUTH_MAX_LOCK_COUNT),
	])
	return { maxLoginAttempts, lockoutDuration, autoResetAfter, maxLockCount }
}
import { combineResponses } from './misc'
import { sessionStorage } from './session.server'
import { parsePermissionString, PermissionString } from './user'

export async function getSessionExpirationDate() {
	const sessionExpirationDays = await getSetting<number>(SettingKeys.AUTH_SESSION_EXPIRATION_DAYS)
	const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * sessionExpirationDays
	return new Date(Date.now() + SESSION_EXPIRATION_TIME)
}

export const sessionKey = 'sessionId'

function generateFingerprint(request: Request): string {
	// Start with universally supported headers
	const components = [
		request.headers.get('user-agent') || '',
		request.headers.get('accept-language') || '',
	]

	// Add modern headers only if available
	const modernHeaders = ['sec-ch-ua', 'sec-ch-ua-platform']
	modernHeaders.forEach(header => {
		const value = request.headers.get(header)
		if (value) components.push(value)
	})

	return crypto
		.createHmac('sha256', process.env.SESSION_SECRET)
		.update(components.filter(Boolean).join('|'))
		.digest('hex')
}

export async function getUserId(request: Request) {
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = cookieSession.get(sessionKey)
	if (!sessionId) return null

	const session = await prisma.session.findUnique({
		select: { userId: true, metadata: true },
		where: { id: sessionId },
	})

	if (!session) {
		throw await logout({ request })
	}

	const currentFingerprint = generateFingerprint(request)
	const sessionMetadata = session.metadata as { fingerprint: string } | null

	if (
		sessionMetadata?.fingerprint &&
		currentFingerprint !== sessionMetadata.fingerprint
	) {
		throw await logout({ request })
	}

	return session.userId
}

export async function getUser(userId: string) {
	return await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			username: true,
			name: true,
			tenantId: true,
			image: { select: { id: true } },
			roles: {
				select: {
					name: true,
					permissions: {
						select: {
							entity: true,
							action: true,
							access: true,
						},
					},
					menus: {
						select: {
							id: true,
							name: true,
							title: true,
						},
					},
					menuItems: {
						select: {
							id: true,
							menuId: true,
							name: true,
							title: true,
							icon: true,
							link: true,
						},
					},
				},
			},
			password: false, // intentionally omit password
			sessions: true,
		},
	})
}

export async function requireAnonymous(request: Request) {
	const userId = await getUserId(request)
	if (userId) {
		throw redirect('/')
	}
}

export async function requireUserId(
	request: Request,
	{ redirectTo }: { redirectTo?: string | null } = {},
) {
	const userId = await getUserId(request)
	if (!userId) {
		const requestUrl = new URL(request.url)
		redirectTo =
			redirectTo === null
				? null
				: (redirectTo ?? `${requestUrl.pathname}${requestUrl.search}`)
		const loginParams = redirectTo ? new URLSearchParams({ redirectTo }) : null
		const loginRedirect = ['/login', loginParams?.toString()]
			.filter(Boolean)
			.join('?')
		throw redirect(loginRedirect)
	}

	return userId
}

export async function requireUser(request: Request) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		select: { id: true, username: true, tenantId: true },
		where: { id: userId },
	})
	if (!user) {
		throw await logout({ request })
	}
	return user
}

export async function login({
	username,
	password,
	request,
}: {
	username: User['username']
	password: string
	request: Request
}) {
	const user = await verifyUserPassword({ username }, password)
	if (!user) return null

	const metadata = {
		fingerprint: generateFingerprint(request),
	}

	const session = await prisma.session.create({
		select: { id: true, userId: true, expirationDate: true },
		data: {
			userId: user.id,
			expirationDate: await getSessionExpirationDate(),
			metadata,
		},
	})

	return session
}

export async function signup({
	email,
	username,
	password,
	name,
	request,
}: {
	email: User['email']
	username: User['username']
	name: User['name']
	password: string
	request: Request
}) {
	const hashedPassword = await getPasswordHash(password)

	const metadata = {
		fingerprint: generateFingerprint(request),
	}

	const session = await prisma.session.create({
		select: { id: true, expirationDate: true },
		data: {
			expirationDate: await getSessionExpirationDate(),
			metadata,
			user: {
				create: {
					email: email.toLowerCase(),
					username: username.toLowerCase(),
					name,
					roles: {
						connect: [{ name: 'user' }],
					},
					password: {
						create: {
							hash: hashedPassword,
						},
					},
				},
			},
		},
	})

	return session
}

export async function logout(
	{
		request,
		redirectTo = '/',
	}: {
		request: Request
		redirectTo?: string
	},
	responseInit?: ResponseInit,
) {
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)

	const sessionId = cookieSession.get(sessionKey)

	// Get user info before deleting session for audit log
	if (sessionId) {
		const session = await prisma.session.findUnique({
			where: { id: sessionId },
			select: {
				userId: true,
				user: {
					select: { id: true, username: true, email: true, tenantId: true },
				},
			},
		})

		if (session) {
			// Log logout event
			await createAuditLog({
				action: AuditAction.LOGOUT,
				entityType: AuditEntityType.SESSION,
				entityId: sessionId,
				description: `User ${session.user.username} logged out`,
				userId: session.userId,
				tenantId: session.user.tenantId,
				metadata: {
					user: {
						id: session.user.id,
						username: session.user.username,
						email: session.user.email,
					},
					sessionId,
				},
				ipAddress: getClientIp(request),
				userAgent: getUserAgent(request),
			})
		}

		void prisma.session.delete({ where: { id: sessionId } }).catch(() => {})
	}

	throw redirect(
		safeRedirect(redirectTo),
		combineResponses(responseInit, {
			headers: {
				'set-cookie': await sessionStorage.destroySession(cookieSession),
			},
		}),
	)
}

export async function getPasswordHash(password: string) {
	const saltRounds = await getSetting<number>(SettingKeys.AUTH_BCRYPT_SALT_ROUNDS)
	const hash = await bcrypt.hash(password, saltRounds)
	return hash
}

export async function verifyUserPassword(
	where: Pick<User, 'username'> | Pick<User, 'id'>,
	password: Password['hash'],
) {
	// Load auth settings from database
	const authSettings = await getAuthSettings()

	const userWithPassword = await prisma.user.findUnique({
		where,
		select: {
			id: true,
			tenantId: true,
			status: true,
			failedLoginAttempts: true,
			lastFailedLoginAt: true,
			autoUnlockAt: true,
			lockCount: true,
			password: { select: { hash: true } },
		},
	})

	if (!userWithPassword || !userWithPassword.password) {
		return null
	}

	// Check if account is locked
	if (userWithPassword.status === 'LOCKED') {
		// If lock count is too high, require manual intervention
		if (userWithPassword.lockCount >= authSettings.maxLockCount) {
			throw new Error(
				'Account is permanently locked due to multiple security violations. Please contact an administrator.',
			)
		}

		// If no autoUnlockAt is set, the account was manually locked by an admin
		// and requires manual unlocking
		if (!userWithPassword.autoUnlockAt) {
			throw new Error(
				'Account is locked. Please contact an administrator to unlock your account.',
			)
		}

		if (isBefore(new Date(), userWithPassword.autoUnlockAt)) {
			throw new Error('Account is locked. Please try again later.')
		} else {
			// Auto-unlock the account if lockout duration has passed and lock count is below threshold
			await prisma.user.update({
				where: { id: userWithPassword.id },
				data: {
					status: 'ACTIVE',
					failedLoginAttempts: 0,
					lockedAt: null,
					lockReason: null,
					autoUnlockAt: null,
				},
			})
		}
	}

	// Check if we should reset failed attempts due to time passed
	if (
		userWithPassword.lastFailedLoginAt &&
		isBefore(
			addMinutes(
				userWithPassword.lastFailedLoginAt,
				authSettings.autoResetAfter,
			),
			new Date(),
		)
	) {
		await prisma.user.update({
			where: { id: userWithPassword.id },
			data: {
				failedLoginAttempts: 0,
				lastFailedLoginAt: null,
			},
		})
	}

	const isValid = await bcrypt.compare(password, userWithPassword.password.hash)

	if (!isValid) {
		// Increment failed attempts
		const failedAttempts = (userWithPassword.failedLoginAttempts || 0) + 1
		const updates = {
			failedLoginAttempts: failedAttempts,
			lastFailedLoginAt: new Date(),
			status: undefined as 'LOCKED' | undefined,
			lockedAt: undefined as Date | undefined,
			lockReason: undefined as string | undefined,
			lockCount: undefined as number | undefined,
			autoUnlockAt: undefined as Date | null | undefined,
		}

		// Lock account if max attempts reached
		if (failedAttempts >= authSettings.maxLoginAttempts) {
			const finalLockCount = (userWithPassword.lockCount || 0) + 1
			updates.status = 'LOCKED'
			updates.lockedAt = new Date()
			updates.lockReason = 'Too many failed login attempts'
			updates.lockCount = finalLockCount
			updates.autoUnlockAt =
				finalLockCount >= authSettings.maxLockCount
					? null // No auto-unlock for accounts locked too many times
					: addMinutes(new Date(), authSettings.lockoutDuration)
		}

		await prisma.user.update({
			where: { id: userWithPassword.id },
			data: {
				...updates,
				status: updates.status as 'LOCKED' | undefined,
			},
		})

		// Create audit log
		await prisma.auditLog.create({
			data: {
				userId: userWithPassword.id,
				action: 'LOGIN',
				entityType: 'USER',
				entityId: userWithPassword.id,
				description: `Failed login attempt ${failedAttempts}/${authSettings.maxLoginAttempts}`,
				metadata: {
					failedAttempts,
					isLocked: failedAttempts >= authSettings.maxLoginAttempts,
					lockCount: updates.lockCount || userWithPassword.lockCount || 0,
				},
			},
		})

		if (failedAttempts >= authSettings.maxLoginAttempts) {
			const message =
				(updates.lockCount || 0) >= authSettings.maxLockCount
					? 'Account has been permanently locked due to multiple security violations. Please contact an administrator.'
					: `Account locked due to too many failed attempts. Please try again after ${authSettings.lockoutDuration} minutes.`
			throw new Error(message)
		}

		return null
	}

	// Reset failed attempts on successful login
	if (userWithPassword.failedLoginAttempts > 0) {
		await prisma.user.update({
			where: { id: userWithPassword.id },
			data: {
				failedLoginAttempts: 0,
				lastFailedLoginAt: null,
			},
		})
	}

	return { id: userWithPassword.id, tenantId: userWithPassword.tenantId }
}

export async function requireUserWithPermission(
	request: Request,
	permission: PermissionString,
) {
	const userId = await requireUserId(request)
	const permissionData = parsePermissionString(permission)
	const user = await prisma.user.findFirst({
		select: { id: true },
		where: {
			id: userId,
			roles: {
				some: {
					permissions: {
						some: {
							...permissionData,
							access: permissionData.access
								? { in: permissionData.access }
								: undefined,
						},
					},
				},
			},
		},
	})

	if (!user) {
		throw json(
			{
				error: 'Unauthorized',
				requiredPermission: permissionData,
				message: `Unauthorized: required permissions: ${permission}`,
			},
			{ status: 403 },
		)
	}
	return user.id
}

export async function requireUserWithRole(request: Request, name: string) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findFirst({
		select: { id: true, email: true },
		where: { id: userId, roles: { some: { name } } },
	})

	if (!user) {
		throw json(
			{
				error: 'Unauthorized',
				requiredRole: name,
				message: `Unauthorized: required role: ${name}`,
			},
			{ status: 403 },
		)
	}

	return user
}

export async function requireUserWithRoles(request: Request, roles: string[]) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findFirst({
		select: { id: true, email: true, username: true },
		where: {
			id: userId,
			roles: {
				some: {
					name: { in: roles },
				},
			},
		},
	})

	if (!user) {
		throw json(
			{
				error: 'Unauthorized',
				requiredRoles: roles,
				message: `Unauthorized: required roles: ${roles.join(', ')}`,
			},
			{ status: 403 },
		)
	}

	return user
}

export async function resetUserPassword({
	username,
	password,
}: {
	username: User['username']
	password: string
}) {
	const hashedPassword = await getPasswordHash(password)

	return prisma.user.update({
		select: { id: true },
		where: { username },
		data: {
			password: {
				update: {
					hash: hashedPassword,
				},
			},
		},
	})
}

// ============================================================================
// MULTI-TENANCY AUTH HELPERS
// ============================================================================

/**
 * Type for authenticated user with tenant context
 */
export type TenantAuthUser = {
	id: string
	email: string
	username: string
	tenantId: string | null
	isGlobalAdmin: boolean
	isTenantAdmin?: boolean
}

/**
 * Require user with GLOBAL scope (admin role with GLOBAL scope)
 * Use for: Creating tenants, managing all tenants, system-wide operations
 */
export async function requireGlobalAdmin(request: Request): Promise<TenantAuthUser> {
	const userId = await requireUserId(request)
	const user = await prisma.user.findFirst({
		where: {
			id: userId,
			roles: { some: { scope: RoleScope.GLOBAL } },
		},
		select: { id: true, email: true, username: true, tenantId: true },
	})

	if (!user) {
		throw json(
			{
				error: 'Unauthorized',
				message: 'Global admin access required',
			},
			{ status: 403 },
		)
	}

	return { ...user, isGlobalAdmin: true }
}

/**
 * Require admin access (global admin or tenant admin)
 * - Global admins (GLOBAL scope): Can access all tenants
 * - Tenant admins (TENANT scope): Can only access their own tenant
 * Use for: Admin routes that need tenant filtering
 *
 * @param request - The incoming request
 * @param targetTenantId - Optional: validate access to a specific tenant
 */
export async function requireAdminAccess(
	request: Request,
	targetTenantId?: string,
): Promise<TenantAuthUser> {
	const userId = await requireUserId(request)
	const user = await prisma.user.findFirst({
		where: { id: userId },
		select: {
			id: true,
			email: true,
			username: true,
			tenantId: true,
			roles: { select: { name: true, scope: true } },
		},
	})

	if (!user) {
		throw json(
			{
				error: 'Unauthorized',
				message: 'Access denied',
			},
			{ status: 403 },
		)
	}

	// Global admin bypasses all tenant checks
	const isGlobalAdmin = user.roles.some((r) => r.scope === RoleScope.GLOBAL)
	if (isGlobalAdmin) {
		return {
			id: user.id,
			email: user.email,
			username: user.username,
			tenantId: user.tenantId,
			isGlobalAdmin: true,
		}
	}

	// Check for TENANT or admin scope
	const isTenantScope = user.roles.some(
		(r) => r.scope === RoleScope.TENANT || r.name === 'admin',
	)
	if (!isTenantScope) {
		throw json(
			{
				error: 'Unauthorized',
				message: 'Admin access required',
			},
			{ status: 403 },
		)
	}

	// If targetTenantId provided, validate ownership
	if (targetTenantId && user.tenantId !== targetTenantId) {
		throw json(
			{
				error: 'Unauthorized',
				message: 'Access denied: wrong tenant',
			},
			{ status: 403 },
		)
	}

	// Tenant admins must have a tenantId
	if (!user.tenantId) {
		throw json(
			{
				error: 'Unauthorized',
				message: 'User has no tenant assignment',
			},
			{ status: 403 },
		)
	}
	return {
		id: user.id,
		email: user.email,
		username: user.username,
		tenantId: user.tenantId,
		isGlobalAdmin: false,
		isTenantAdmin: true,
	}
}

/**
 * Get tenant filter for Prisma queries based on user's scope
 * Global admins see all data, others see only their tenant's data
 *
 * @param user - User with isGlobalAdmin and tenantId
 * @returns Object to spread into Prisma where clause
 * @throws Error if non-global user has no tenantId (should not happen in normal flow)
 */
export function getTenantFilter(user: {
	isGlobalAdmin: boolean
	tenantId: string | null
}): { tenantId?: string } {
	if (user.isGlobalAdmin) {
		return {} // No filter - global admin sees all
	}
	if (!user.tenantId) {
		// This should never happen as requireAdminAccess validates tenantId
		// But we handle it defensively to avoid data leaks
		throw json(
			{
				error: 'Unauthorized',
				message: 'User has no tenant assignment',
			},
			{ status: 403 },
		)
	}
	return { tenantId: user.tenantId }
}

/**
 * Require event-level access for validators, focal users, etc.
 * Checks UserEventAccess table for authorization
 *
 * @param request - The incoming request
 * @param eventId - The event to check access for
 * @param allowedRoles - Roles that grant access (e.g., ['validator', 'focal'])
 */
export async function requireEventAccess(
	request: Request,
	eventId: string,
	allowedRoles: string[],
): Promise<TenantAuthUser & { eventAccess: { stepId: string | null } | null }> {
	const userId = await requireUserId(request)
	const user = await prisma.user.findFirst({
		where: { id: userId },
		select: {
			id: true,
			email: true,
			username: true,
			tenantId: true,
			roles: { select: { id: true, name: true, scope: true } },
		},
	})

	if (!user) {
		throw json(
			{
				error: 'Unauthorized',
				message: 'Access denied',
			},
			{ status: 403 },
		)
	}

	// Global admin bypasses event access checks
	if (user.roles.some((r) => r.scope === RoleScope.GLOBAL)) {
		return {
			id: user.id,
			email: user.email,
			username: user.username,
			tenantId: user.tenantId,
			isGlobalAdmin: true,
			eventAccess: null,
		}
	}

	// Tenant admin bypasses for events in their tenant
	if (
		user.tenantId &&
		user.roles.some((r) => r.scope === RoleScope.TENANT || r.name === 'admin')
	) {
		const event = await prisma.event.findFirst({
			where: { id: eventId, tenantId: user.tenantId },
		})
		if (event) {
			return {
				id: user.id,
				email: user.email,
				username: user.username,
				tenantId: user.tenantId,
				isGlobalAdmin: false,
				isTenantAdmin: true,
				eventAccess: null,
			}
		}
	}

	// Check UserEventAccess for event-scoped roles
	const access = await prisma.userEventAccess.findFirst({
		where: {
			userId: user.id,
			eventId,
			role: { name: { in: allowedRoles } },
		},
		select: { stepId: true },
	})

	if (!access) {
		throw json(
			{
				error: 'Unauthorized',
				message: 'Event access denied',
			},
			{ status: 403 },
		)
	}

	return {
		id: user.id,
		email: user.email,
		username: user.username,
		tenantId: user.tenantId,
		isGlobalAdmin: false,
		eventAccess: access,
	}
}

/**
 * Get step IDs that a user has access to for validation
 * Used by validator routes to filter participants by assigned steps
 *
 * @param userId - The user ID to check
 * @returns Array of step IDs the user can work on
 */
export async function getUserAccessibleStepIds(
	userId: string,
	roleNames?: string[],
): Promise<string[]> {
	const accesses = await prisma.userEventAccess.findMany({
		where: {
			userId,
			stepId: { not: null },
			role: {
				name: {
					in: roleNames ?? ['validator', 'reviewer', 'printer', 'dispatcher'],
				},
			},
		},
		select: { stepId: true },
	})

	return accesses.map((a) => a.stepId).filter(Boolean) as string[]
}

/**
 * Get step IDs and the associated participant type IDs that a user has access to.
 * Used for defense-in-depth filtering: ensures validators/printers only see
 * participants whose type matches the workflows they are assigned to.
 */
export async function getUserAccessibleStepInfo(
	userId: string,
	roleNames?: string[],
): Promise<{ stepIds: string[]; participantTypeIds: string[] }> {
	const accesses = await prisma.userEventAccess.findMany({
		where: {
			userId,
			stepId: { not: null },
			role: {
				name: {
					in: roleNames ?? ['validator', 'reviewer', 'printer', 'dispatcher'],
				},
			},
		},
		select: {
			stepId: true,
			step: {
				select: {
					workflow: {
						select: { participantTypeId: true },
					},
				},
			},
		},
	})

	const stepIds = accesses.map((a) => a.stepId).filter(Boolean) as string[]
	const participantTypeIds = [
		...new Set(
			accesses
				.map((a) => a.step?.workflow?.participantTypeId)
				.filter(Boolean) as string[],
		),
	]

	return { stepIds, participantTypeIds }
}

/**
 * Get event IDs that a user has access to (for focal and event-scoped roles)
 * Used by focal dashboard to show only assigned events
 *
 * @param userId - The user ID to check
 * @param roles - Roles to filter by (e.g., ['focal'])
 * @returns Array of unique event IDs
 */
export async function getUserAccessibleEventIds(
	userId: string,
	roles: string[],
): Promise<string[]> {
	const accesses = await prisma.userEventAccess.findMany({
		where: {
			userId,
			role: { name: { in: roles } },
		},
		select: { eventId: true },
	})

	return [...new Set(accesses.map((a) => a.eventId))]
}
