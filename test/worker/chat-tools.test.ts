import { describe, expect, it } from 'vitest'

import type { WebSearch } from '../../src/server/llm/search'
import { chatTools } from '../../src/server/llm/tools'
import {
	proposePlanChangeTool,
	recordOffersTool,
	webSearchTool,
} from '../../src/shared/chat'
import { chatOpNames } from '../../src/shared/plan'

/** A search that answers nothing. */
const noResults: WebSearch = async () => ({ status: 'ok', results: [] })

/** The registry as a deployment with a search key gets it. */
const tools = chatTools(noResults)

/**
 * The Proposal tool's description is a string, so nothing typechecks it against
 * the schema declared beside it. This is what does: an op added to the schema
 * reaches the model whether or not anything tells the model what it does.
 */
describe('the Proposal tool', () => {
	// The SDK types a description as a string or a function that builds one.
	// Ours is a string, and a test that reads it says so rather than guessing.
	const described = tools[proposePlanChangeTool].description
	const description = typeof described === 'string' ? described : ''

	it('teaches every op it offers', () => {
		const taught = chatOpNames.filter((op) => description.includes(op))

		expect(taught).toEqual(chatOpNames)
	})

	// The other half of the same rule. Research reaches the Plan by the writer
	// Accepting an Offer — `docs/chat.md` — so the ops that put a Reference in
	// the Plan are neither offered nor described.
	it('teaches no op it does not offer', () => {
		for (const op of ['createReference', 'deleteReference', 'setReference']) {
			expect(description).not.toContain(op)
		}
	})
})

/**
 * The suspend-or-execute rule is per tool rather than for the registry. A tool
 * with no `execute` suspends for the client, and that suspension is the
 * Proposal the writer rules on. An Offer is a row instead: nothing suspends,
 * and the writer rules on it later in the Offer ledger.
 */
describe('the Offer tool', () => {
	it('runs on the server, where the Proposal tool suspends', () => {
		expect(tools[proposePlanChangeTool].execute).toBeUndefined()
		expect(tools[recordOffersTool].execute).toBeTypeOf('function')
	})

	// The one rule the schema does not carry is worth stating.
	it('teaches that Offers are flat', () => {
		const described = tools[recordOffersTool].description

		expect(typeof described === 'string' ? described : '').toContain('Offers are flat')
	})
})

/** Registered per deployment rather than always: a Chat with no search key is
 * offered no search tool, and `chatSystemPrompt` reads the same value. */
describe('the search tool', () => {
	it('is offered where a search is given, and runs on the server', () => {
		expect(Object.keys(tools)).toContain(webSearchTool)
		expect(tools[webSearchTool].execute).toBeTypeOf('function')
	})

	it('is absent where no search is given, leaving the other two', () => {
		expect(Object.keys(chatTools())).toEqual([proposePlanChangeTool, recordOffersTool])
	})

	// What stops a retrieved Quote being reworded on its way into an Offer.
	it('teaches that a Quote is copied from an excerpt', () => {
		const described = tools[webSearchTool].description
		const description = typeof described === 'string' ? described : ''

		expect(description).toContain('word for word')
		expect(description).toContain('Only offer urls this tool')
	})

	it('teaches what an unavailable search means', () => {
		const described = tools[webSearchTool].description

		expect(typeof described === 'string' ? described : '').toContain('unavailable')
	})
})
