import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigation } from '@remix-run/react'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { requireGlobalAdmin } from '~/utils/auth.server'
import { getSettingsByCategory } from '~/utils/settings.server'
import { SettingField } from './__setting-field'
import { handleSettingsAction } from './__settings.server'

const CATEGORY = 'backup'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireGlobalAdmin(request)
	const settings = await getSettingsByCategory(CATEGORY)
	return json({ settings })
}

export async function action({ request }: ActionFunctionArgs) {
	await requireGlobalAdmin(request)
	return handleSettingsAction(request, CATEGORY)
}

export default function BackupSettingsRoute() {
	const { settings } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const isSubmitting = navigation.state === 'submitting'

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Backup Settings</CardTitle>
					<CardDescription>
						Configure backup retention and cleanup settings
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
		</div>
	)
}
