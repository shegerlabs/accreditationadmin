import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { getUser, logout, requireUserId } from '~/utils/auth.server'
import { userHasRoles } from '~/utils/user'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = userId ? await getUser(userId) : null

	if (userHasRoles(user, ['admin', 'tenant'])) {
		throw redirect('/admin/tenants')
	}

	if (userHasRoles(user, ['validator', 'reviewer'])) {
		throw redirect('/validator/requests')
	}

	if (userHasRoles(user, ['printer'])) {
		throw redirect('/printer/requests')
	}

	if (userHasRoles(user, ['dispatcher'])) {
		throw redirect('/dispatcher/requests')
	}

	if (userHasRoles(user, ['checkpoint'])) {
		throw redirect('/checker/scan')
	}

	if (userHasRoles(user, ['user', 'focal'])) {
		throw await logout({ request })
	}

	return json({})
}

export default function LandingPage() {
	return <></>
}
