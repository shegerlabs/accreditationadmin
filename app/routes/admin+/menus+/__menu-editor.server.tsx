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
import { MenuEditorSchema } from './__menu-editor'

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin'])
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	const submission = await parseWithZod(formData, {
		schema: MenuEditorSchema.superRefine(async (data, ctx) => {
			const menu = await prisma.menu.findFirst({
				where: { name: data.name },
				select: { id: true },
			})

			if (menu && menu.id !== data.id) {
				ctx.addIssue({
					path: ['name'],
					code: z.ZodIssueCode.custom,
					message: 'Menu with this name already exists.',
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

	const { id: menuId, name, title, roles } = submission.value

	const data = {
		name,
		title,
		roles,
		// items,
	}

	const menu = await prisma.menu.upsert({
		select: { id: true },
		where: { id: menuId ?? '__new_menu__' },
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
		entityType: AuditEntityType.MENU,
		entityId: menu.id,
		description: 'Menu updated',
		userId: user.id,
		metadata: {
			menu: {
				id: menu.id,
				...data,
			},
		},
	})

	return redirectWithToast('/admin/menus', {
		type: 'success',
		title: `Menu ${menuId ? 'Updated' : 'Created'}`,
		description: `Menu ${menuId ? 'updated' : 'created'} successfully.`,
	})
}
