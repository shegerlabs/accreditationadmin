import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType, Prisma } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { auditRequest } from '~/utils/audit.server'
import { requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import { TenantDeleteSchema, TenantEditorSchema } from './__tenant-editor'

export async function action({ request }: ActionFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	// Only global admins can delete tenants
	if (intent === 'delete') {
		if (!currentUser.isGlobalAdmin) {
			throw json(
				{ message: 'Only global admins can delete tenants' },
				{ status: 403 },
			)
		}

		const submission = await parseWithZod(formData, {
			schema: TenantDeleteSchema,
			async: true,
		})
		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const tenant = await prisma.tenant
			.delete({
				where: { id: submission.value.id },
				select: {
					id: true,
					name: true,
					email: true,
					phone: true,
					website: true,
					address: true,
					city: true,
					state: true,
					zip: true,
					country: true,
				},
			})
			// Step's participant and approval foreign keys are NO ACTION, so this
			// fails instead of cascading into participants and approval history.
			.catch((error: unknown) => {
				if (
					error instanceof Prisma.PrismaClientKnownRequestError &&
					error.code === 'P2003'
				)
					return null
				throw error
			})
		if (!tenant) {
			return redirectWithToast('/admin/tenants', {
				type: 'error',
				title: 'Cannot Delete',
				description:
					'Workflow steps that hold participants or approval history use this tenant, so it can’t be deleted.',
			})
		}

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.TENANT,
			entityId: submission.value.id,
			description: 'Tenant deleted',
			userId: currentUser.id,
			metadata: {
				tenant,
			},
		})

		return redirectWithToast('/admin/tenants', {
			type: 'success',
			title: `Tenant Deleted`,
			description: `Tenant deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: TenantEditorSchema.superRefine(async (data, ctx) => {
			const tenant = await prisma.tenant.findUnique({
				where: { email: data.email },
				select: { id: true },
			})

			if (tenant && tenant.id !== data.id) {
				ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: 'Tenant with this email already exists.',
				})
				return
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { id: tenantId, ...data } = submission.value

	// Only global admins can create new tenants
	if (!tenantId && !currentUser.isGlobalAdmin) {
		throw json(
			{ message: 'Only global admins can create tenants' },
			{ status: 403 },
		)
	}

	// Tenant admins can only update their own tenant
	if (tenantId && !currentUser.isGlobalAdmin) {
		if (tenantId !== currentUser.tenantId) {
			throw json(
				{ message: 'You can only update your own tenant' },
				{ status: 403 },
			)
		}
	}

	await prisma.tenant.upsert({
		select: { id: true },
		where: { id: tenantId ?? '__new_tenant__' },
		create: {
			...data,
			subscriptionPlan: data.subscriptionPlan ?? 'free',
		},
		update: {
			...data,
		},
	})

	const action = tenantId ? AuditAction.UPDATE : AuditAction.CREATE
	const entityType = AuditEntityType.TENANT
	const entityId = tenantId
	const description = tenantId ? 'Tenant updated' : 'Tenant created'
	await auditRequest({
		request,
		action,
		entityType,
		entityId,
		description,
		userId: currentUser.id,
		metadata: {
			tenant: {
				...data,
			},
		},
	})

	return redirectWithToast('/admin/tenants', {
		type: 'success',
		title: `Tenant ${tenantId ? 'Updated' : 'Created'}`,
		description: `Tenant ${tenantId ? 'updated' : 'created'} successfully.`,
	})
}
