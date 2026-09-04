import {
	type ArticleEdit,
	type ArticleEntry,
	articleListSchema,
	articleReplySchema,
} from '../../shared/article'

/**
 * The article index over HTTP — the one store that is not reactive (`docs/articles.md`).
 *
 * Answers are parsed rather than asserted, so a route that drifts from the
 * shared schema fails here with a sentence rather than rendering half a row.
 */

const base = '/api/articles'

export async function fetchArticles(): Promise<ArticleEntry[]> {
	const answer = await send(base)

	return articleListSchema.parse(answer).articles
}

/** Untitled: the name travels into the Article screen and reaches the index as a
 * copy of the Plan's, so nothing may name a row ahead of the Plan
 * (architecture.md §4.6). */
export async function createArticle(): Promise<ArticleEntry> {
	const answer = await send(base, 'POST', {})

	return articleReplySchema.parse(answer).article
}

export async function editArticle(id: string, edit: ArticleEdit): Promise<ArticleEntry> {
	const answer = await send(`${base}/${encodeURIComponent(id)}`, 'PATCH', edit)

	return articleReplySchema.parse(answer).article
}

/** For the new-Article dialog the writer backed out of. Not Archiving, which is
 * what putting a real Article away is. */
export async function discardArticle(id: string): Promise<void> {
	await send(`${base}/${encodeURIComponent(id)}`, 'DELETE')
}

async function send(url: string, method = 'GET', body?: unknown): Promise<unknown> {
	const response = await fetch(url, {
		method,
		...(body === undefined
			? {}
			: { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
	})

	if (!response.ok) throw new Error(await reasonFor(response))

	// A discard answers 204, and `json()` throws on an empty body.
	if (response.status === 204) return null

	return response.json()
}

/** The route's own sentence, or the status where there is none — an Access
 * redirect answers HTML, and `json()` throws on it. */
async function reasonFor(response: Response): Promise<string> {
	try {
		const body: unknown = await response.json()
		if (typeof body === 'object' && body !== null && 'error' in body) {
			return String(body.error)
		}
	} catch {
		/* Not JSON. */
	}

	return `The index answered ${response.status}.`
}
