import { cloudflare } from '@cloudflare/vite-plugin'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import agents from 'agents/vite'
import { defineConfig } from 'vite'

// Storybook loads this same config, and it renders components without the app
// around them. The Worker and the router are left out there: the Cloudflare
// plugin would start workerd for a Worker no story calls, and the router plugin
// would rewrite the route tree from a process that has no routes in view.
//
// Storybook sets this variable itself, so nothing in this repo assigns it.
const forStorybook = process.env.STORYBOOK === 'true'

export default defineConfig({
	plugins: [
		// The router plugin generates the route tree, and must run before React.
		forStorybook
			? []
			: tanstackRouter({
					target: 'react',
					routesDirectory: './src/client/routes',
					generatedRouteTree: './src/client/routeTree.gen.ts',
					autoCodeSplitting: true,
				}),
		react(),
		// React Compiler memoises components and hooks at build time, which covers
		// most of what the app would otherwise hand-write `memo`, `useMemo`, and
		// `useCallback` for. Write one where it measurably helps; it is the
		// routine ones that are now redundant.
		//
		// It only compiles what it can prove follows the Rules of React and
		// silently skips the rest, so the `react/react-compiler` oxlint rule is the
		// half that tells you when a component has opted itself out.
		//
		// `@vitejs/plugin-react` runs on Oxc and takes no Babel plugins of its own;
		// this is the supported route, and the preset limits itself to the client
		// build, so the Worker is untouched.
		babel({ presets: [reactCompilerPreset()] }),
		tailwindcss(),
		// Cloudflare's workaround for `@callable` support in Vite 8. Vite 8
		// transpiles with oxc, which does not implement TC39 decorators
		// (oxc#9170) and emits the `@` syntax verbatim, so the Worker fails to
		// parse with "SyntaxError: Invalid or unexpected token". This plugin
		// lowers them through Babel.
		//
		// `experimentalDecorators` is not the fix: the SDK uses standard
		// decorators, and the legacy convention hands `callable()` the prototype
		// instead of the method, so nothing registers and every RPC call is
		// refused at runtime with "is not callable" — a silent failure where the
		// missing plugin is a loud one.
		//
		// `vitest.config.ts` names it separately; the two files share no plugins.
		forStorybook ? [] : agents(),
		// Runs the Worker in workerd beside the client, so `pnpm dev` serves both.
		forStorybook
			? []
			: cloudflare({
					// Workers AI is remote-only, and remote bindings open a proxy session
					// at startup that demands an API token — so leaving them off is what
					// lets a fresh clone run `pnpm dev`. Set CF_REMOTE_BINDINGS=true to
					// call a model.
					remoteBindings: process.env.CF_REMOTE_BINDINGS === 'true',
				}),
	],
})
