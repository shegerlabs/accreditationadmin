import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useLocation } from '@remix-run/react'
import { ImagePlus } from 'lucide-react'
import {
	BoxSheetButton,
	PrintBoxButton,
	PrintSelectedButtons,
} from '~/components/boxes/box-action'
import { BoxBrowser } from '~/components/boxes/box-browser'
import { Button } from '~/components/ui/button'
import { requireUserWithRoles } from '~/utils/auth.server'
import { loadPrinterView } from '~/utils/boxes.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])
	return json(await loadPrinterView(user.id, new URL(request.url)))
}

export default function PrinterBoxesRoute() {
	const view = useLoaderData<typeof loader>()
	const { pathname, search } = useLocation()
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
					headerControls={box => (
						<>
							<BoxSheetButton box={box} size="default" />
							<PrintBoxButton box={box} size="default" />
						</>
					)}
					partAction={(box, part) => (
						<span className="flex gap-1.5">
							<BoxSheetButton box={box} part={part} />
							<PrintBoxButton box={box} part={part} />
						</span>
					)}
					memberActions={(_, m) =>
						m.problems?.noPhoto ? (
							<Button size="sm" variant="outline" asChild>
								<Link
									to={`/printer/requests/${m.id}/edit-photo?${new URLSearchParams({ redirectTo: pathname + search })}`}
								>
									<ImagePlus className="mr-1.5 h-4 w-4" aria-hidden />
									Add photo
								</Link>
							</Button>
						) : null
					}
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
