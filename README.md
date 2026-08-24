# Scribble Harness

An AI harness so you can have your own Clippy so good that even you want to use it 🖇️

The writer writes the prose and an AI acts as a guide. The architecture is in
[`docs/architecture.md`](./docs/architecture.md), the words it uses are fixed in
[`docs/context.md`](./docs/context.md), and UI/design guidelines are described in
[`docs/ui.md`](./docs/ui.md).

## Running it

Node 22 and pnpm 11.

```sh
pnpm install
pnpm db:migrate # the article index's schema, into the local D1. Once per clone
pnpm dev        # the client and the Worker together, on http://localhost:5173
pnpm storybook  # the components and screens on their own, on http://localhost:6006
pnpm test       # builds the client, then runs every project
                # `pnpm test:shared` and `pnpm test:client` skip the build and workerd
                # `pnpm test:stories` runs the stories alone, and needs the browser
pnpm typecheck
pnpm lint       # oxlint
pnpm format     # oxfmt, in place. `pnpm format:check` reports instead
```

`pnpm dev` runs the Worker in workerd through the Cloudflare Vite plugin, so the bindings
behave as they do in production. Storybook loads the same Vite config without the Worker or
the router, so a story renders components alone.

Run `pnpm db:migrate` again whenever a file lands in `migrations/`, and again if
`database_id` in `wrangler.jsonc` changes — the local database is stored under that id, so a
new one starts empty and every index route answers 500 until it is migrated. It is local
only; the test suite applies the same files itself, so `pnpm test` needs nothing set up.

### Running the stories

The `stories` project mounts every story in a real Chromium through
`@storybook/addon-vitest`, so effects run and layout is computed. It needs the browser
installed once:

```sh
pnpm exec playwright install --with-deps chromium
```

Each story is then held to the layout invariants in `.storybook/vitest.setup.ts`: no Frame
mounts collapsed, no Panel spills past the Frame that clips it, a Frame body is the height
its screen asked for, and each Panel scrolls its own Y.

### Calling a model locally

Workers AI has no local simulator, so the `AI` binding always reaches Cloudflare. `pnpm dev`
leaves remote bindings off, which is what lets a fresh clone start with no Cloudflare login.
To make a real model call, log in and turn them on:

```sh
pnpm wrangler login
CF_REMOTE_BINDINGS=true pnpm dev
```

### Letting the Chat search the web

The guide looks sources up through [Exa](https://exa.ai) rather than recalling them. It needs
an API key, in `.dev.vars` for `pnpm dev`:

```sh
echo 'EXA_API_KEY=your-key-here' >> .dev.vars
```

Leaving it unset takes the search tool out of the Chat and tells the guide to answer from
memory, which is what a fresh clone and `pnpm test` run as.

### Deploying

The article index has a D1 database of its own, named in `wrangler.jsonc`. Apply the schema
to it whenever a file lands in `migrations/`:

```sh
pnpm db:migrate:remote
```

A different account needs a database of its own: `pnpm wrangler d1 create scribble` prints
a name and an id to paste into `database_name` and `database_id`. The id is what binds and
the name beside it is a label, so the two can disagree —
[`docs/deploy.md`](./docs/deploy.md) has the case where they do, and the swap that settles
it.

```sh
pnpm deploy     # builds the client, then wrangler deploy
```

`AI_GATEWAY_ID` names the AI Gateway the model calls log through. Set it from the CLI rather
than in `wrangler.jsonc`, because a var declared there overwrites the deployed value on every
deploy:

```sh
pnpm wrangler secret put AI_GATEWAY_ID
```

Leaving it unset attaches no Gateway, which is what a deployment without one wants — a
Gateway that does not exist fails the call. Leave the Gateway itself **unauthenticated**: a
Workers AI binding call is same-account and carries no place to put a Gateway token.

The search key goes the same way, as a secret rather than a var:

```sh
pnpm wrangler secret put EXA_API_KEY
```

The Worker is deployed as `scribble` and serves `scribble.msnook.xyz`, which
`wrangler.jsonc` binds as a custom domain on every deploy. Deploying to a different account
needs that `routes` entry changed to a hostname on a zone that account holds, or removed so
the Worker answers on `workers.dev` alone.

Declaring that route takes the `workers.dev` route away, so `wrangler.jsonc` turns
`preview_urls` back on by hand — `wrangler versions upload` then puts a version on a URL of
its own without making it production.

The Worker needs the Workers Paid plan for the model, and Cloudflare Access gates it at the
edge. Nothing in the app reads the `Cf-Access-Jwt-Assertion` header — localhost has no
Access gate, and requiring the header would make the app unrunnable in development.

## Layout

| Path                          | What it holds                                                         |
| ----------------------------- | --------------------------------------------------------------------- |
| `src/client/routes/`          | TanStack Router routes, one file each                                 |
| `src/client/components/`      | The primitives: `Frame`, `PanelRail`, `Chip`, `ReferenceCard`, …      |
| `src/client/articles/`        | The Articles Area: the index over HTTP, the list, and the Board View  |
| `src/client/article/`         | One Article screen: its four Panels, its rail, and its title copy     |
| `src/client/plan/`            | The Plan Panel: its op builders, its writer, and its fields           |
| `src/client/styles/theme.css` | The Tailwind v4 `@theme` tokens                                       |
| `src/server/`                 | The Hono Worker entry and the `ArticleAgent` Durable Object           |
| `src/server/llm/`             | The model boundary, the Chat turn's prompt pack, and the tools        |
| `migrations/`                 | The article index's D1 schema, applied by `pnpm db:migrate`           |
| `test/`                       | Three of the four Vitest projects: `shared`, `client`, and `worker`   |
| `.storybook/`                 | Storybook's config, the layout invariants, the stories, and the mocks |
| `.storybook/screens/`         | The wireframed screens, built against mock data                       |
| `docs/`                       | The architecture document, the ADRs, and [the UI notes](./docs/ui.md) |

The screens are wireframes, and each is superseded as the route that replaces it lands, so
treat them as reference rather than as a library. A wired screen renders the live component
against mock data rather than a copy of it: `1(a) Articles` and `1(b) Board` draw the same
`ArticleList` and `BoardView` the routes do, and every screen holding a Plan renders it
through the Plan Panel's own components.
