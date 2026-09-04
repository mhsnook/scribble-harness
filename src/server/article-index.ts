import { Hono } from 'hono'
import { z } from 'zod'

import {
	ARTICLE_STATUSES,
	type ArticleEntry,
	articleEditSchema,
	type ArticleStatus,
	newArticleSchema,
} from '../shared/article'

/**
 * The article index, over D1 — `docs/articles.md`. Nothing here reaches
 * into an Article Agent, so removing a row leaves one exactly as it was.
 *
 * Nothing parses a token either: Access gates the Worker at the edge, and 1a may
 * not require the Cf-Access-Jwt-Assertion header (architecture.md §4.8).
 */

/** `status` is stated as what the write routes parsed rather than checked again
 * — these routes are the table's only writer, as `OfferRow` argues too. */
type ArticleRow = {
	id: string
	title: string
	status: ArticleStatus
	created_at: number
	updated_at: number
	archived_at: number | null
}

const columns = 'id, title, status, created_at, updated_at, archived_at'

function toEntry(row: ArticleRow): ArticleEntry {
	return {
		id: row.id,
		title: row.title,
		status: row.status,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		archivedAt: row.archived_at,
	}
}

export const articleIndex = new Hono<{ Bindings: Env }>()

	/** Every Article, Archived included: one Team's index sends whole, and the
	 * Views filter. Paginate here if the table outgrows one response. */
	.get('/', async (c) => {
		const rows = await c.env.DB.prepare(
			`SELECT ${columns} FROM article ORDER BY updated_at DESC`,
		).all<ArticleRow>()

		return c.json({ articles: rows.results.map(toEntry) })
	})

	/** The Article Agent is not woken here: it builds itself on the first
	 * connect, with the empty Plan its `initialState` carries. */
	.post('/', async (c) => {
		const sent = newArticleSchema.safeParse(await body(c.req.raw))
		if (!sent.success) return c.json({ error: z.prettifyError(sent.error) }, 400)

		const now = Date.now()
		const row = await c.env.DB.prepare(
			`INSERT INTO article (${columns}) VALUES (?, ?, ?, ?, ?, NULL) RETURNING ${columns}`,
		)
			.bind(crypto.randomUUID(), sent.data.title ?? '', ARTICLE_STATUSES[0], now, now)
			.first<ArticleRow>()

		if (row === null) return c.json({ error: 'The Article was not created.' }, 500)

		return c.json({ article: toEntry(row) }, 201)
	})

	/** Rename, restatus, Archive, or restore. A title arrives after the Plan
	 * write it copies, so a failure here is a stale row the next rename fixes. */
	.patch('/:id', async (c) => {
		const sent = articleEditSchema.safeParse(await body(c.req.raw))
		if (!sent.success) return c.json({ error: z.prettifyError(sent.error) }, 400)

		const { title, status, archived } = sent.data
		const now = Date.now()

		// One record rather than two arrays that have to stay index-aligned, and
		// one clock read, so an Archived row's two stamps agree.
		const set: Record<string, string | number | null> = { updated_at: now }
		if (title !== undefined) set.title = title
		if (status !== undefined) set.status = status
		if (archived !== undefined) set.archived_at = archived ? now : null

		const assignments = Object.keys(set)
			.map((column) => `${column} = ?`)
			.join(', ')

		const row = await c.env.DB.prepare(
			`UPDATE article SET ${assignments} WHERE id = ? RETURNING ${columns}`,
		)
			.bind(...Object.values(set), c.req.param('id'))
			.first<ArticleRow>()

		if (row === null) return c.json({ error: 'No Article carries that id.' }, 404)

		return c.json({ article: toEntry(row) })
	})

	/**
	 * Not Archiving. This is how the new-Article dialog cleans up the row it
	 * opened when the writer backs out before naming it, and nothing is destroyed
	 * because nothing is there yet.
	 */
	.delete('/:id', async (c) => {
		const removed = await c.env.DB.prepare('DELETE FROM article WHERE id = ?')
			.bind(c.req.param('id'))
			.run()

		if (removed.meta.changes === 0) {
			return c.json({ error: 'No Article carries that id.' }, 404)
		}

		return c.body(null, 204)
	})

/** A POST with no body is the ordinary way to open an Article, and `json()`
 * throws on one. */
async function body(request: Request): Promise<unknown> {
	try {
		return await request.json()
	} catch {
		return {}
	}
}
