import { describe, expect, it } from 'vitest'

import { readWebSearch, searchNote } from '../../src/client/chat/search'
import { webSearchTool } from '../../src/shared/chat'
import { toolPart } from './chat-fixtures'

/** Reading a search out of the transcript, and the line the Chat Panel shows
 * for it. The writer rules on nothing here — this is what stops a turn that
 * searches reading as a turn that stalled. */

const part = (state: string, extra: Record<string, unknown> = {}) =>
	toolPart(webSearchTool, state, { input: { query: 'permit backlog' }, ...extra })

const found = (count: number) => ({
	status: 'ok',
	results: Array.from({ length: count }, (_, at) => ({
		url: `https://example.test/${at}`,
	})),
})

describe('a search in the transcript', () => {
	it('counts what a finished search returned', () => {
		const call = readWebSearch(part('output-available', { output: found(3) }) as never)

		expect(call).toEqual({ queries: ['permit backlog'], outcome: 3 })
	})

	it('is running until the output arrives', () => {
		expect(readWebSearch(part('input-available') as never).outcome).toBe('running')
		expect(readWebSearch(part('input-streaming') as never).outcome).toBe('running')
	})

	// The model streams the call in, so the query lands before the whole input
	// parses. Reading it field by field is what shows it that early.
	it('reads the query before the call is whole', () => {
		const streaming = toolPart(webSearchTool, 'input-streaming', {
			input: { query: 'permit backlog' },
		})

		expect(readWebSearch(streaming as never).queries).toEqual(['permit backlog'])
	})

	it('has no query until the model has streamed one', () => {
		const empty = toolPart(webSearchTool, 'input-streaming', { input: {} })

		expect(readWebSearch(empty as never).queries).toEqual([])
	})

	// The tool never throws, so this is how a failed search arrives rather than
	// as `output-error` — `src/server/llm/search.ts`.
	it('fails on a search that did not happen', () => {
		const out = { status: 'unavailable', reason: 'The provider answered 429.' }

		expect(readWebSearch(part('output-available', { output: out }) as never)).toEqual({
			queries: ['permit backlog'],
			outcome: 'failed',
		})
	})

	it('fails on an output it cannot read, and on a tool error', () => {
		const junk = part('output-available', { output: { status: 'sideways' } })

		expect(readWebSearch(junk as never).outcome).toBe('failed')
		expect(readWebSearch(part('output-error') as never).outcome).toBe('failed')
	})

	// Nothing found is a search that worked, and reads differently to the writer
	// than one that did not happen.
	it('is not what an empty result set is', () => {
		const empty = part('output-available', { output: found(0) })

		expect(readWebSearch(empty as never).outcome).toBe(0)
	})

	it('reads every query of a call that searched several', () => {
		const several = toolPart(webSearchTool, 'output-available', {
			input: { queries: ['permit backlog', 'housing starts 2026'] },
			output: { ...found(2), considered: 11 },
		})

		expect(readWebSearch(several as never)).toEqual({
			queries: ['permit backlog', 'housing starts 2026'],
			outcome: 2,
			considered: 11,
		})
	})

	// The model streams the array in, so a query that has not started yet is not
	// a string.
	it('skips a query the model has not written yet', () => {
		const streaming = toolPart(webSearchTool, 'input-streaming', {
			input: { queries: ['permit backlog', null] },
		})

		expect(readWebSearch(streaming as never).queries).toEqual(['permit backlog'])
	})
})

describe('the line a search gets', () => {
	const line = (
		outcome: number | 'running' | 'failed',
		queries: string[] = ['permit backlog'],
		considered?: number,
	) => searchNote({ queries, outcome, ...(considered !== undefined && { considered }) })

	it('names what the guide searched for', () => {
		expect(line('running')).toBe('Searching “permit backlog”…')
		expect(line(4)).toBe('Searched “permit backlog” — 4 results.')
	})

	it('counts one result in the singular', () => {
		expect(line(1)).toBe('Searched “permit backlog” — 1 result.')
	})

	it('tells the writer nothing was found, and that is not a failure', () => {
		expect(line(0)).toBe('Searched “permit backlog”, and found nothing.')
		expect(line('failed')).toContain('failed')
	})

	// A failure says the guide carried on, because it did — the turn still
	// answered the writer.
	it('says the guide answered without the search when it failed', () => {
		expect(line('failed')).toBe(
			'Searching “permit backlog” failed, so the guide answered without it.',
		)
	})

	// The query is absent while the call streams, and the line still has to read.
	it('falls back to naming the web when there is no query yet', () => {
		expect(line('running', [])).toBe('Searching the web…')
	})

	it('names every query, joined the way a sentence lists them', () => {
		expect(line('running', ['a', 'b'])).toBe('Searching “a” and “b”…')
		expect(line('running', ['a', 'b', 'c'])).toBe('Searching “a”, “b” and “c”…')
	})

	// The ranking keeps fewer than it pooled, and the writer sees both numbers.
	it('says how many it kept out of how many it pooled', () => {
		expect(line(6, ['a', 'b'], 20)).toBe('Searched “a” and “b” — kept 6 of 20.')
		expect(line(3, ['a'], 3)).toBe('Searched “a” — 3 results.')
	})

	it('tells finding nothing apart from finding nothing worth showing', () => {
		expect(line(0, ['a'], 0)).toBe('Searched “a”, and found nothing.')
		expect(line(0, ['a'], 9)).toBe(
			'Searched “a”, and none of 9 results was worth showing.',
		)
	})
})
