/**
 * By default, Remix will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/file-conventions/entry.client
 */

import { RemixBrowser } from '@remix-run/react'
import { startTransition, StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'

// async function enableApiMocking() {
// 	if (process.env.NODE_ENV !== 'development') {
// 		return
// 	}

// 	const { worker } = await import('../tests/mocks/browser')
// 	await worker.start({
// 		onUnhandledRequest: 'bypass',
// 	})
// }

// enableApiMocking().then(() => {
// 	startTransition(() => {
// 		hydrateRoot(
// 			document,
// 			<StrictMode>
// 				<RemixBrowser />
// 			</StrictMode>,
// 		)
// 	})
// })

// Ensure React is properly loaded before hydration
startTransition(() => {
	try {
		hydrateRoot(
			document,
			<StrictMode>
				<RemixBrowser />
			</StrictMode>,
		)
	} catch (error) {
		console.error('Hydration error:', error)
	}
})
