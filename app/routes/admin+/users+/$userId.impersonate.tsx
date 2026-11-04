import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, redirect } from '@remix-run/node'
import { auditRequest } from '~/utils/audit.server'
import { requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import {
	generateImpersonationToken,
	getImpersonationRedirectUrl,
	isImpersonationEnabled,
} from '~/utils/impersonation.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

export async function action({ params, request }: ActionFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const { userId } = params

	// Only global admins and tenant admins can impersonate
	if (!currentUser.isGlobalAdmin && !currentUser.isTenantAdmin) {
		return redirectWithToast(`/admin/users/${userId}`, {
			type: 'error',
			title: 'Unauthorized',
			description: 'Only admin and tenant users can impersonate other users.',
		})
	}

	// Check if impersonation is enabled
	if (!isImpersonationEnabled()) {
		return redirectWithToast(`/admin/users/${userId}`, {
			type: 'error',
			title: 'Impersonation Disabled',
			description: 'Impersonation is not configured. Please set IMPERSONATION_SECRET and USER_PORTAL_URL environment variables.',
		})
	}

	// Get target user with tenant info
	const targetUser = await prisma.user.findFirst({
		where: currentUser.isGlobalAdmin
			? { id: userId }
			: {
					id: userId,
					OR: [
						{ tenantId: currentUser.tenantId },
						{ tenantId: null },
					],
				},
		select: {
			id: true,
			username: true,
			name: true,
			email: true,
			tenantId: true,
			tenant: {
				select: { name: true },
			},
			roles: {
				select: { name: true },
			},
		},
	})

	invariantResponse(targetUser, 'User not found', { status: 404 })

	// Prevent admin from impersonating themselves
	if (targetUser.id === currentUser.id) {
		return redirectWithToast(`/admin/users/${userId}`, {
			type: 'error',
			title: 'Cannot Impersonate',
			description: 'You cannot impersonate yourself.',
		})
	}

	// Tenant admins cannot impersonate users from other tenants
	if (!currentUser.isGlobalAdmin && targetUser.tenantId && targetUser.tenantId !== currentUser.tenantId) {
		return redirectWithToast(`/admin/users/${userId}`, {
			type: 'error',
			title: 'Cannot Impersonate',
			description: 'You can only impersonate users from your own tenant.',
		})
	}

	// Generate the impersonation token with return URL
	const token = generateImpersonationToken({
		userId: targetUser.id,
		adminId: currentUser.id,
		adminName: currentUser.username,
		tenantId: targetUser.tenantId,
		returnUrl: `/admin/users/${targetUser.id}`,
	})

	// Log the impersonation action
	await auditRequest({
		request,
		action: AuditAction.IMPERSONATE,
		entityType: AuditEntityType.USER,
		entityId: targetUser.id,
		description: `Admin ${currentUser.username} started impersonating user ${targetUser.username}`,
		userId: currentUser.id,
		tenantId: targetUser.tenantId,
		metadata: {
			targetUser: {
				id: targetUser.id,
				username: targetUser.username,
				name: targetUser.name,
				email: targetUser.email,
				roles: targetUser.roles.map(r => r.name),
			},
			admin: {
				id: currentUser.id,
				username: currentUser.username,
				isGlobalAdmin: currentUser.isGlobalAdmin,
			},
		},
	})

	// Redirect to user portal with the token
	const redirectUrl = getImpersonationRedirectUrl(token)
	return redirect(redirectUrl)
}

// This route only handles POST actions, no loader or component needed
export async function loader() {
	return redirect('/admin/users')
}
