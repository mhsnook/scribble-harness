import { env, SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import {
	type ArticleEntry,
	articleListSchema,
	articleReplySchema,
} from '../../src/shared/article'

/** The index over its HTTP routes, which is the only way the client reaches it. */

const base = 'https://harness.test/api/articles'

// Isolated storage does not roll a D1 write back between tests.
beforeEach(async () => {
	await env.DB.prepare('DELETE FROM article').run()
})

async function create(body?: unknown): Promise<Response> {
	return SELF.fetch(base, {
		method: 'POST',
		...(body === undefined
			? {}
			: { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
	})
}

async function createdArticle(body?: unknown): Promise<ArticleEntry> {
	const response = await create(body)
	expect(response.status).toBe(201)

	return articleReplySchema.parse(await response.json()).article
}

async function edit(id: string, body: unknown): Promise<Response> {
	return SELF.fetch(`${base}/${id}`, {
		method: 'PATCH',
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json' },
	})
}

async function discard(id: string): Promise<Response> {
	return SELF.fetch(`${base}/${id}`, { method: 'DELETE' })
}

async function list(): Promise<ArticleEntry[]> {
	const response = await SELF.fetch(base)
	expect(response.status).toBe(200)

	return articleListSchema.parse(await response.json()).articles
}

describe('creating an Article', () => {
	it('opens an untitled row at the first status', async () => {
		const article = await createdArticle()

		expect(article.title).toBe('')
		expect(article.status).toBe('planning')
		expect(article.archivedAt).toBeNull()
		expect(article.id).not.toBe('')
	})

	it('takes a title where the caller has one', async () => {
		const article = await createdArticle({ title: 'Why Cities Stopped Building' })

		expect(article.title).toBe('Why Cities Stopped Building')
	})

	it('gives each Article its own id', async () => {
		const one = await createdArticle()
		const two = await createdArticle()

		expect(one.id).not.toBe(two.id)
	})

	it('refuses a body it cannot read', async () => {
		const response = await create({ status: 'done' })

		expect(response.status).toBe(400)
	})
})

describe('the list', () => {
	it('is empty before anything is created', async () => {
		await expect(list()).resolves.toEqual([])
	})

	it('carries every Article, most recently changed first', async () => {
		const first = await createdArticle({ title: 'First' })
		const second = await createdArticle({ title: 'Second' })
		await edit(first.id, { status: 'drafting' })

		const titles = (await list()).map((article) => article.title)
		expect(titles).toEqual(['First', 'Second'])
		expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt)
	})

	it('keeps an Archived Article on the same table', async () => {
		const article = await createdArticle({ title: 'Put away' })
		await edit(article.id, { archived: true })

		const listed = await list()
		expect(listed).toHaveLength(1)
		expect(listed[0].archivedAt).not.toBeNull()
	})
})

describe('editing a row', () => {
	it('writes the title copy', async () => {
		const article = await createdArticle()
		const response = await edit(article.id, { title: 'Notes on Slow Software' })

		expect(response.status).toBe(200)
		expect(articleReplySchema.parse(await response.json()).article.title).toBe(
			'Notes on Slow Software',
		)
	})

	it('writes the status the Board View reads', async () => {
		const article = await createdArticle()
		await edit(article.id, { status: 'self-edit' })

		expect((await list())[0].status).toBe('self-edit')
	})

	it('restores an Archived Article', async () => {
		const article = await createdArticle()
		await edit(article.id, { archived: true })
		await edit(article.id, { archived: false })

		expect((await list())[0].archivedAt).toBeNull()
	})

	it('refuses a status it does not carry', async () => {
		const article = await createdArticle()

		expect((await edit(article.id, { status: 'shipped' })).status).toBe(400)
	})

	it('refuses an edit that changes nothing', async () => {
		const article = await createdArticle()

		expect((await edit(article.id, {})).status).toBe(400)
	})

	it('answers 404 for an id no Article carries', async () => {
		expect((await edit('nobody', { title: 'x' })).status).toBe(404)
	})
})

describe('discarding a row', () => {
	it('takes it off the list', async () => {
		const article = await createdArticle()

		expect((await discard(article.id)).status).toBe(204)
		await expect(list()).resolves.toEqual([])
	})

	it('answers 404 for an id no Article carries', async () => {
		expect((await discard('nobody')).status).toBe(404)
	})
})

describe('the index against the Article Agent', () => {
	// The index is a list, not a store — `docs/articles.md`.
	it('leaves the Article Agent alone when its row is removed', async () => {
		const article = await createdArticle({ title: 'Held elsewhere' })

		const agent = env.ArticleAgent.get(env.ArticleAgent.idFromName(article.id))
		await agent.setState({
			title: 'Held elsewhere',
			totalTarget: 2400,
			adjectives: [],
			outline: [],
			references: [],
		})

		expect((await discard(article.id)).status).toBe(204)

		await expect(list()).resolves.toEqual([])
		await expect(agent.state).resolves.toMatchObject({ totalTarget: 2400 })
	})
})
