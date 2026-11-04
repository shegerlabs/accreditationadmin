import { LoaderFunctionArgs, redirect } from '@remix-run/node'

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const redirectUrl = `/validator/requests${url.searchParams.size ? '?' + url.searchParams.toString() : ''}`
	return redirect(redirectUrl)
}

export default function CancelRoute() {
	return null
}
