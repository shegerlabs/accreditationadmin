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

const CATEGORY = 'sla'
const CATEGORY_LABEL = 'SLA'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])
	const settings = await getSettingsByCategory(CATEGORY)
	return json({ settings })
}

export async function action({ request }: ActionFunctionArgs) {
	return handleSettingsAction(request, CATEGORY)
}

export default function SlaSettingsRoute() {
	const { settings } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const isSubmitting = navigation.state === 'submitting'

	return (
		<Card>
			<CardHeader>
				<CardTitle>{CATEGORY_LABEL}</CardTitle>
				<CardDescription>
					Configure SLA warning thresholds
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
