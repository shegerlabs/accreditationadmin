import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { CountryEditor } from './__country-editor'
export { action } from './__country-editor.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin'])

	const { countryId } = params

	const country = await prisma.country.findUnique({
		where: { id: countryId },
		select: {
			id: true,
			name: true,
			code: true,
		},
	})

	invariantResponse(country, 'Country not found', { status: 404 })

	return json({ country })
}

export default function EditCountryRoute() {
	const { country } = useLoaderData<typeof loader>()
	return <CountryEditor country={country} title="Edit Country" intent="edit" />
}
