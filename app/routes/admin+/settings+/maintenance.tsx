import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigation } from '@remix-run/react'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { requireUserWithRoles } from '~/utils/auth.server'
import { getSettingsByCategory } from '~/utils/settings.server'
import { SettingField } from './__setting-field'
import { handleSettingsAction } from './__settings.server'

const CATEGORY = 'maintenance'
const CATEGORY_LABEL = 'Maintenance'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const settings = await getSettingsByCategory(CATEGORY)
	return json({ settings })
}

export async function action({ request }: ActionFunctionArgs) {
	return handleSettingsAction(request, CATEGORY)
}

export default function MaintenanceSettingsRoute() {
	const { settings } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const isSubmitting = navigation.state === 'submitting'

	return (
		<Card>
			<CardHeader>
				<CardTitle>{CATEGORY_LABEL}</CardTitle>
				<CardDescription>
					Configure maintenance mode to temporarily block non-admin users from
					accessing the system
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-6">
					{settings.map(setting => (
						<SettingField
							key={setting.key}
							setting={setting}
							category={CATEGORY}
							isSubmitting={isSubmitting}
						/>
					))}
				</div>
			</CardContent>
		</Card>
	)
}
