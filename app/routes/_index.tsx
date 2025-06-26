import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { getUser, logout, requireUserId } from '~/utils/auth.server'
import { userHasRoles } from '~/utils/user'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = userId ? await getUser(userId) : null

	if (userHasRoles(user, ['admin'])) {
		throw redirect('/admin/events')
	}

	if (
		userHasRoles(user, [
			'mofa-validator',
			'mofa-printer',
			'niss-validator',
			'et-broadcast',
			'first-validator',
			'second-validator',
			'printer',
		])
	) {
		throw redirect('/validator/requests')
	}

	if (userHasRoles(user, ['user', 'focal'])) {
		throw await logout({ request })
	}

	return json({})
}

export default function LandingPage() {
	return <></>
}
