import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { EditIcon, TrashIcon, UserIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { z } from 'zod'
import { ActionForm } from '~/components/action-form'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

export const MenuItemDeleteSchema = z.object({
	menuId: z.string(),
	menuItemId: z.string(),
})

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const { menuId } = params

	invariantResponse(menuId, 'Menu ID is required', { status: 404 })
	const menu = await prisma.menu.findUnique({
		where: { id: menuId },
		include: {
			items: {
				include: {
					roles: {
						select: {
							id: true,
							name: true,
							description: true,
						},
					},
				},
			},
			roles: {
				select: {
					id: true,
					name: true,
					description: true,
				},
			},
		},
	})
	invariantResponse(menu, 'Menu not found', { status: 404 })

	return json({
		status: 'idle',
		menu,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

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

	const { menuId, menuItemId } = submission.value

	if (intent === 'delete') {
		await prisma.menuItem.delete({
			where: { id: menuItemId },
		})
	}

	throw await redirectWithToast(`/admin/menus/${menuId}/items`, {
		type: 'success',
		title: 'Menu Item Deleted',
		description: 'The menu item has been deleted',
	})
}

export default function IndexRoute() {
	const { menu } = useLoaderData<typeof loader>()
	const isMobile = useMediaQuery({ maxWidth: 767 })

	const deleteAction = (item: any) => (
		<ActionForm
			method="POST"
			data={{
				menuId: menu.id,
				menuItemId: item.id,
			}}
			buttonContent={<TrashIcon className="h-4 w-4" />}
			buttonVariant="destructive"
			buttonSize="sm"
			intent="delete"
		/>
	)

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-4 divide-dotted border-b pb-2 text-base font-semibold leading-6 text-gray-500">
					Menu Items for {menu.name}
				</div>
				<div className="mb-6">
					<SearchBar
						status="idle"
						action={`/admin/menus/${menu.id}/items`}
						autoSubmit={false}
						filters={[]}
						showAddButton={false}
					/>
				</div>
				<DataList
					data={menu.items}
					columns={[
						{
							key: 'title',
							header: 'Title',
							render: (item: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>{item.title}</span>
								</div>
							),
						},
						{ key: 'name', header: 'Name' },
						{ key: 'link', header: 'Link' },
						{ key: 'icon', header: 'Icon' },
					]}
					actions={[
						{
							label: 'Edit',
							icon: <EditIcon className="h-4 w-4" />,
							href: (item: any) =>
								`/admin/menus/${menu.id}/items/${item.id}/edit`,
							variant: 'outline' as const,
						},
						{
							label: 'Delete',
							icon: <TrashIcon className="h-4 w-4" />,
							variant: 'outline' as const,
							render: (permission: any) => deleteAction(permission),
						},
					]}
					status="idle"
					isMobile={isMobile}
					keyExtractor={item => item.id}
					actionWidth="96"
				/>
			</div>
		</div>
	)
}
