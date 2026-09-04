// Nothing here parses a token, and nothing may require the
// Cf-Access-Jwt-Assertion header — docs/architecture.md §4.8.

import { routeAgentRequest } from 'agents'
import { Hono } from 'hono'
import { routePartykitRequest } from 'partyserver'

import { ArticleAgent } from './article-agent'
import { articleIndex } from './article-index'
import { House } from './house'

// Re-exported so the Durable Object classes ship with the Worker bundle.
export { ArticleAgent, House }

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ ok: true }))

// The article index, over D1 — `docs/articles.md`. Mounted ahead of the
// catch-all below, which Hono would otherwise match first.
app.route('/api/articles', articleIndex)

// routeAgentRequest maps /agents/article-agent/:name onto the ArticleAgent
// binding — the path segment is the binding name in kebab-case.
app.all('/agents/*', async (c) => {
	const response = await routeAgentRequest(c.req.raw, c.env)
	return response ?? c.text('No such Agent route', 404)
})

// The party-db sync sockets — `docs/sync.md`. routePartykitRequest maps
// /parties/article-agent/:name onto the same ArticleAgent binding the route
// above serves, and /parties/house/house onto the House.
app.all('/parties/*', async (c) => {
	const response = await routePartykitRequest(c.req.raw, c.env)
	return response ?? c.text('No such party route', 404)
})

// Without this, notFound below would answer an unknown /api path with the
// client and a 200.
app.all('/api/*', (c) => c.text('No such API route', 404))

// Any other path is a client route. In production the edge serves assets before
// the Worker runs, so this only fires under `SELF.fetch`, which skips the edge
// router. It reads as dead code and is not.
app.notFound((c) => c.env.ASSETS.fetch(c.req.raw))

export default app
