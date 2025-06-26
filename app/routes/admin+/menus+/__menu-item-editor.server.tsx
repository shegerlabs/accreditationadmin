import { parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import {
	MenuItemDeleteSchema,
	MenuItemEditorSchema,
} from './__menu-item-editor'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'delete') {
		const submission = await parseWithZod(formData, {
			schema: MenuItemDeleteSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const menuItem = await prisma.menuItem.delete({
			where: { id: submission.value.id },
			select: { menuId: true, id: true },
		})

		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.MENU_ITEM,
			entityId: menuItem.id,
			description: 'Menu Item deleted',
			userId: user.id,
			metadata: { menuItem },
		})

		return redirectWithToast(`/admin/menus/${menuItem.menuId}/items`, {
			type: 'success',
			title: `Menu Item Deleted`,
			description: `Menu Item deleted successfully.`,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: MenuItemEditorSchema.superRefine(async (data, ctx) => {
			const menuItem = await prisma.menuItem.findUnique({
				where: { menuId_name: { menuId: data.menuId, name: data.name } },
				select: { id: true },
			})

			if (menuItem && menuItem.id !== data.id) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message: 'Menu Item with this name already exists.',
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

	const { id: menuItemId, roles, ...data } = submission.value

	const menuItem = await prisma.menuItem.upsert({
		select: { id: true, menuId: true },
		where: { id: menuItemId ?? '__new_menu_item__' },
		create: {
			...data,
			roles: {
				connect: roles.map(role => ({ id: role })),
			},
		},
		update: {
			...data,
			roles: {
				set: roles.map(role => ({ id: role })),
			},
		},
	})

	await auditRequest({
		request,
		action: AuditAction.UPDATE,
		entityType: AuditEntityType.MENU_ITEM,
		entityId: menuItem.id,
		description: 'Menu Item updated',
		userId: user.id,
		metadata: {
			menuItem: {
				id: menuItem.id,
				...data,
			},
		},
	})

	return redirectWithToast(`/admin/menus/${menuItem.menuId}/items`, {
		type: 'success',
		title: `Menu Item ${menuItemId ? 'Updated' : 'Created'}`,
		description: `Menu Item ${menuItemId ? 'updated' : 'created'} successfully.`,
	})
}
