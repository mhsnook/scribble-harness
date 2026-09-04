import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import babel from '@rolldown/plugin-babel'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import tailwindcss from '@tailwindcss/vite'
import { reactCompilerPreset } from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import agents from 'agents/vite'
import { defineConfig } from 'vitest/config'

// Four projects, split by what the code under test needs. A test in test/shared
// or test/client runs in node against a pure module; a test in test/worker runs
// in workerd with the bindings; a story in the stories project runs in a real
// Chromium. `pnpm test:shared` and `pnpm test:client` skip the Vite build and
// workerd startup, which is most of the time a worker test takes, and
// `pnpm test:stories` skips both but needs the browser instead.
//
// The client project holds the Plan Panel's arithmetic — its op builders and
// its debounced writer. Those compute rather than render, so there is still no
// environment to configure there.

// `storybookTest` reads the Storybook config off disk, so it is async and has
// to be awaited before the config object is built.
const storybookPlugins = await storybookTest({ configDir: '.storybook' })

// `migrations_dir` in wrangler.jsonc is read by the CLI, not by the test pool,
// so the files are read here and applied by test/worker/apply-migrations.ts.
const migrations = await readD1Migrations('./migrations')

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'shared',
					include: ['test/shared/**/*.test.ts'],
					environment: 'node',
				},
			},
			{
				test: {
					name: 'client',
					include: ['test/client/**/*.test.ts'],
					environment: 'node',
				},
			},
			{
				plugins: [
					// Cloudflare's workaround for `@callable` support in Vite 8 —
					// `vite.config.ts` carries the reasoning. A worker test builds the
					// Article Agent, and the two files share no plugins, so it is named
					// in both.
					agents(),
					// `cloudflareTest` is the current API. Most docs still show
					// `defineWorkersConfig` with `poolOptions.workers`, which no longer
					// resolves — the package stopped exporting "./config".
					cloudflareTest({
						wrangler: { configPath: './wrangler.jsonc' },
						// The AI binding is the only remote-only one and no test calls a
						// model, so keep everything in the local workerd rather than making
						// `pnpm test` need an API token.
						remoteBindings: false,
						miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
					}),
				],
				test: {
					name: 'worker',
					include: ['test/worker/**/*.test.ts'],
					setupFiles: ['./test/worker/apply-migrations.ts'],
				},
			},
			{
				// One test per story, mounted in a real browser. Effects run and
				// layout is computed, so this reaches the defects that live in what a
				// component renders rather than in what it computes.
				plugins: [
					// Vitest reads this file rather than vite.config.ts, so the stories
					// project has to name Tailwind itself. Without it every utility class
					// is inert and a height a screen asked for is never applied — which
					// is exactly the layout the assertions below are here to catch.
					tailwindcss(),
					// And React Compiler for the same reason. Without it these stories
					// mount components the build does not ship, so a story could pass
					// against source the compiler rewrote differently.
					babel({ presets: [reactCompilerPreset()] }),
					storybookPlugins,
				],
				test: {
					name: 'stories',
					// Storybook's own preview annotations, plus the layout invariants
					// every story is held to.
					setupFiles: ['./.storybook/vitest.setup.ts'],
					browser: {
						enabled: true,
						headless: true,
						provider: playwright(),
						instances: [{ browser: 'chromium' }],
						// No `viewport` here. `@storybook/addon-vitest` resizes the page
						// before each story, so a size set here is overwritten before
						// anything is measured. The one every story is drawn at is the
						// `target` viewport in .storybook/preview.tsx.
					},
				},
			},
		],
	},
})
