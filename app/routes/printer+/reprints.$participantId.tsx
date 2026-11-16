import { redirect, type LoaderFunctionArgs } from '@remix-run/node'

// Badges reprinted from the old reprint queue have QR codes pointing here.
export async function loader({ request, params }: LoaderFunctionArgs) {
	const { search } = new URL(request.url)
	throw redirect(`/printer/requests/${params.participantId}${search}`)
}
