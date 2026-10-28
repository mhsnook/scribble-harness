import { describe, expect, it, vi } from 'vitest'

import type { Answer, Decide, Question } from '../../src/server/llm/decide'
import { KEEP, pick, research, urlKey } from '../../src/server/llm/research'
import type { WebSearch, WebSearchResult } from '../../src/server/llm/search'
import type { Favourite } from '../../src/shared/house'
import { emptyPlan } from '../../src/shared/plan'

/**
 * One research call — `docs/llm.md`. Nothing here reaches Exa or Clef: both
 * are scripted, and what is under test is the pooling, the questions asked,
 * and the order the results come back in.
 */

const page = (path: string, extra: Partial<WebSearchResult> = {}): WebSearchResult => ({
	url: `https://example.test/${path}`,
	...extra,
})

/** A search answering each query with the pages listed for it. */
function searching(pages: Record<string, WebSearchResult[]>) {
	return vi.fn<WebSearch>(async ({ query }) => ({
		status: 'ok',
		results: pages[query] ?? [],
	}))
}

const fieldNotes: Favourite = {
	id: 'f1',
	type: 'publication',
	name: 'Field Notes',
	preferFor: ['policy'],
	notFor: 'Opinion columns.',
	createdAt: 1,
	updatedAt: 1,
}

/** A Clef answering merit per url, and naming a favourite for the urls given. */
function deciding(
	merit: Record<string, number>,
	favouriteOf: Record<string, string> = {},
	probability = 0.9,
) {
	return vi.fn<Decide>(async (state, questions) => {
		const { result } = state as { result: WebSearchResult }
		const answers: Record<string, Answer> = {
			merit: { type: 'score', score: merit[result.url] ?? 0 },
		}
		if (questions.favourite !== undefined) {
			const choice = favouriteOf[result.url] ?? 'none'
			answers.favourite = {
				type: 'choice',
				choice,
				probabilities: { [choice]: probability },
			}
		}

		return answers
	})
}

const plan = emptyPlan('The permit backlog')

describe('pooling the searches', () => {
	it('runs every query, and passes the since date to each', async () => {
		const search = searching({})

		await research({ search, favourites: [], plan })({
			queries: ['permit backlog', 'housing starts'],
			since: '2026-01-01',
		})

		expect(search.mock.calls.map(([input]) => input)).toEqual([
			{ query: 'permit backlog', since: '2026-01-01' },
			{ query: 'housing starts', since: '2026-01-01' },
		])
	})

	it('keeps one of each page, under the spellings two searches give it', async () => {
		const search = searching({
			a: [page('permits'), page('starts')],
			b: [{ url: 'https://www.example.test/permits/?utm_source=x#top' }, page('rents')],
		})

		const answer = await research({ search, favourites: [], plan })({
			queries: ['a', 'b'],
		})

		expect(answer).toMatchObject({ status: 'ok', considered: 3 })
	})

	// Unranked, the order is each query's first, then each one's second, so the
	// cap never fills with one query's whole page.
	it('interleaves the searches when nothing ranks them', async () => {
		const search = searching({
			a: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((path) => page(path)),
			b: ['b1', 'b2'].map((path) => page(path)),
		})

		const answer = await research({ search, favourites: [], plan })({
			queries: ['a', 'b'],
		})

		expect(answer.status === 'ok' && answer.results.map((result) => result.url)).toEqual(
			['a1', 'b1', 'a2', 'b2', 'a3', 'a4'].map((path) => page(path).url),
		)
	})

	it('answers unavailable only when every search was', async () => {
		const down: WebSearch = async () => ({
			status: 'unavailable',
			reason: 'The provider answered 429.',
		})
		const half = vi.fn<WebSearch>(async ({ query }) =>
			query === 'a'
				? { status: 'unavailable', reason: 'down' }
				: { status: 'ok', results: [page('b')] },
		)

		expect(
			await research({ search: down, favourites: [], plan })({ queries: ['a', 'b'] }),
		).toEqual({
			status: 'unavailable',
			reason: 'The provider answered 429.',
		})
		expect(
			await research({ search: half, favourites: [], plan })({ queries: ['a', 'b'] }),
		).toMatchObject({
			status: 'ok',
			considered: 1,
		})
	})
})

describe('the questions Clef is asked', () => {
	async function asked(favourites: Favourite[]) {
		const decide = deciding({})
		await research({
			search: searching({ a: [page('permits')] }),
			decide,
			favourites,
			plan,
		})({
			queries: ['a'],
		})

		const [state, questions] = decide.mock.calls[0]!

		return { state, questions: questions as Record<string, Question> }
	}

	it('sends the Article, the queries, and the result as the state', async () => {
		const { state } = await asked([])

		expect(state).toEqual({
			article: { title: 'The permit backlog', sections: [] },
			sought: ['a'],
			result: page('permits'),
		})
	})

	// The favourites rank and never filter, so merit is judged without them.
	it('judges merit without the favourites in view', async () => {
		const { state, questions } = await asked([fieldNotes])

		expect(JSON.stringify(state)).not.toContain('Field Notes')
		expect(JSON.stringify(questions.merit)).not.toContain('Field Notes')
	})

	it('asks which favourite a result is only when there are favourites', async () => {
		expect((await asked([])).questions).not.toHaveProperty('favourite')

		const { questions } = await asked([fieldNotes])
		expect(questions.favourite).toMatchObject({
			type: 'choice',
			criteria: {
				'Publication: Field Notes':
					'Published by Field Notes. Counts only on policy. Does not count for: Opinion columns.',
				none: expect.any(String),
			},
		})
	})
})

describe('the results that come back', () => {
	const pages = ['best', 'good', 'thin', 'off'].map((path) => page(path))
	const merit = {
		[page('best').url]: 2.9,
		[page('good').url]: 2.1,
		[page('thin').url]: 1.2,
		[page('off').url]: 0.1,
	}

	async function ranked(favouriteOf: Record<string, string> = {}, probability?: number) {
		const answer = await research({
			search: searching({ a: pages }),
			decide: deciding(merit, favouriteOf, probability),
			favourites: [fieldNotes],
			plan,
		})({ queries: ['a'] })

		return answer.status === 'ok' ? answer : null
	}

	it('drops what is not worth showing, and puts the best first', async () => {
		const answer = await ranked()

		expect(answer?.results.map((result) => result.url)).toEqual([
			page('best').url,
			page('good').url,
		])
		expect(answer?.considered).toBe(4)
	})

	it('names the favourite a result belongs to', async () => {
		const answer = await ranked({ [page('good').url]: 'Publication: Field Notes' })

		expect(answer?.results[1]).toEqual({ ...page('good'), favourite: 'Field Notes' })
	})

	// Ahead of equally good results, never ahead of better ones.
	it('never puts a favourite ahead of a better result', async () => {
		const answer = await ranked({ [page('good').url]: 'Publication: Field Notes' })

		expect(answer?.results[0]?.url).toBe(page('best').url)
	})

	it('does not count a favourite Clef is unsure of', async () => {
		const answer = await ranked({ [page('good').url]: 'Publication: Field Notes' }, 0.3)

		expect(answer?.results[1]).not.toHaveProperty('favourite')
	})

	it('leaves the results unranked when Clef fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
		const answer = await research({
			search: searching({ a: pages }),
			decide: async () => {
				throw new Error('Workers AI answered 503.')
			},
			favourites: [],
			plan,
		})({ queries: ['a'] })

		expect(answer).toMatchObject({ status: 'ok', considered: 4, results: pages })
		expect(warn).toHaveBeenCalledOnce()
		warn.mockRestore()
	})
})

describe('pick', () => {
	const favourite = { ...fieldNotes }

	it('puts a favourite first within its merit tier', () => {
		const picked = pick(
			[page('plain'), page('loved')],
			[{ merit: 2.4 }, { merit: 1.6, favourite }],
		)

		expect(picked.map((result) => result.url)).toEqual([
			page('loved').url,
			page('plain').url,
		])
	})

	it('keeps a better tier ahead of a favourite', () => {
		const picked = pick(
			[page('loved'), page('better')],
			[{ merit: 2.4, favourite }, { merit: 2.6 }],
		)

		expect(picked.map((result) => result.url)).toEqual([
			page('better').url,
			page('loved').url,
		])
	})

	it(`keeps at most ${KEEP}`, () => {
		const many = Array.from({ length: 10 }, (_, at) => page(`p${at}`))

		expect(
			pick(
				many,
				many.map(() => ({ merit: 3 })),
			),
		).toHaveLength(KEEP)
	})
})

describe('urlKey', () => {
	it('reads one page under the spellings a search gives it', () => {
		expect(urlKey('https://www.Example.test/a/?utm_medium=x#frag')).toBe(
			urlKey('http://example.test/a'),
		)
	})

	it('keeps a query that names a different page', () => {
		expect(urlKey('https://example.test/a?id=1')).not.toBe(
			urlKey('https://example.test/a?id=2'),
		)
	})
})
