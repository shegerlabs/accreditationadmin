import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import {
	PrintBoxButton,
	PrintSelectedButtons,
} from '~/components/boxes/box-action'
import { BoxBrowser } from '~/components/boxes/box-browser'
import { requireUserWithRoles } from '~/utils/auth.server'
import { loadPrinterView } from '~/utils/boxes.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	return json(await loadPrinterView(user.id, new URL(request.url)))
}

export default function PrinterBoxesRoute() {
	const view = useLoaderData<typeof loader>()
	return (
		<>
			<div className="space-y-6">
				<div>
					<h1 className="text-xl font-semibold">Boxes</h1>
					<p className="text-sm text-muted-foreground">
						Print a whole box of badges at once, in surname order, ready to
						pack, or tick the people you want and print just them.
					</p>
				</div>
				<BoxBrowser
					view={view}
					viewer="printer"
					headerControls={box => <PrintBoxButton box={box} size="default" />}
					partAction={(box, part) => <PrintBoxButton box={box} part={part} />}
					selectionAction={(box, ids, clear) => (
						<PrintSelectedButtons box={box} ids={ids} clear={clear} />
					)}
					emptyBox="This box is empty. It fills as people register."
					noBoxes="No boxes yet. An admin creates them under the event’s Boxes tab."
				/>
			</div>
			<Outlet />
		</>
	)
}
