import { redirect, type ActionFunctionArgs } from '@remix-run/node'
import { logout } from '~/utils/auth.server'

export async function loader() {
	return redirect('/')
}

export async function action({ request }: ActionFunctionArgs) {
	throw await logout({ request })
}
