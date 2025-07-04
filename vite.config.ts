import { vitePlugin as remix } from '@remix-run/dev'
import { flatRoutes } from 'remix-flat-routes'
import { defineConfig } from 'vite'
import { envOnlyMacros } from 'vite-env-only'
import tsconfigPaths from 'vite-tsconfig-paths'

const MODE = process.env.NODE_ENV

export default defineConfig({
	build: {
		chunkSizeWarningLimit: 2000,
		cssMinify: MODE === 'production',
		rollupOptions: {
			external: [/node:.*/],
		},

		assetsInlineLimit: (source: string) => {
			if (source.endsWith('sprite.svg') || source.endsWith('favicon.svg')) {
				return false
			}
		},
		sourcemap: MODE === 'development',
	},
	plugins: [
		envOnlyMacros(),
		remix({
			future: {
				v3_fetcherPersist: true,
				v3_relativeSplatPath: true,
				v3_throwAbortReason: true,
			},
			ignoredRouteFiles: ['**/*'],
			serverModuleFormat: 'esm',
			routes: async defineRoutes => {
				return flatRoutes('routes', defineRoutes, {
					ignoredRouteFiles: [
						'.*',
						'**/*.css',
						'**/*.test.{js,jsx,ts,tsx}',
						'**/__*.*',
						// This is for server-side utilities you want to colocate next to
						// your routes without making an additional directory.
						// If you need a route that includes "server" or "client" in the
						// filename, use the escape brackets like: my-route.[server].tsx
						'**/*.server.*',
						'**/*.client.*',
					],
				})
			},
		}),
		tsconfigPaths(),
	],
})
