import jwt from 'jsonwebtoken'

export interface ImpersonationTokenPayload {
	userId: string
	adminId: string
	adminName: string
	tenantId: string | null
	returnUrl: string
	exp: number
}

/**
 * Generate a signed JWT token for impersonation
 * Token expires in 60 seconds (one-time use)
 */
export function generateImpersonationToken(payload: {
	userId: string
	adminId: string
	adminName: string
	tenantId: string | null
	returnUrl: string
}): string {
	const secret = process.env.IMPERSONATION_SECRET

	if (!secret) {
		throw new Error('IMPERSONATION_SECRET environment variable is not set')
	}

	const tokenPayload: ImpersonationTokenPayload = {
		...payload,
		exp: Math.floor(Date.now() / 1000) + 60, // 60 seconds from now
	}

	return jwt.sign(tokenPayload, secret, { algorithm: 'HS256' })
}

/**
 * Get the user portal URL for impersonation redirect
 */
export function getImpersonationRedirectUrl(token: string): string {
	const userPortalUrl = process.env.USER_PORTAL_URL

	if (!userPortalUrl) {
		throw new Error('USER_PORTAL_URL environment variable is not set')
	}

	return `${userPortalUrl}/impersonate?token=${encodeURIComponent(token)}`
}

/**
 * Check if impersonation is enabled (both env vars are set)
 */
export function isImpersonationEnabled(): boolean {
	return !!(process.env.IMPERSONATION_SECRET && process.env.USER_PORTAL_URL)
}
