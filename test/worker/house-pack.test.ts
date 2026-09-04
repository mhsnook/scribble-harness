import type { ModelMessage } from 'ai'
import { describe, expect, it } from 'vitest'

import { chatPackMessages, houseMessage } from '../../src/server/llm/prompt'
import { reviewPackMessages } from '../../src/server/llm/review-pack'
import {
	emptyHouse,
	type HouseContext,
	type LexiconEntry,
	writerProvenance,
} from '../../src/shared/house'
import { makeNode, makePlan } from '../shared/plan-fixtures'

/**
 * The House in the prompt packs — `docs/llm.md` for the order, and
 * `docs/house.md` for what "in play" means.
 */

function entry(term: string, definition: string): LexiconEntry {
	return {
		id: `x-${term}`,
		term,
		definition,
		provenance: writerProvenance(),
		createdAt: 1,
		updatedAt: 1,
	}
}

const house: HouseContext = {
	tone: { voice: 'reported feature', adjectives: ['warm', 'plain'] },
	lexicon: [entry('the Beat', 'A subject I cover over time.')],
	rules: [
		{
			id: 'r1',
			ord: 1,
			body: 'Never open on a rhetorical question.',
			createdAt: 1,
			updatedAt: 1,
		},
	],
}

const said = (message: ModelMessage) => String(message.content)

describe('the House message', () => {
	it('says nothing where the House holds nothing', () => {
		expect(houseMessage(emptyHouse)).toBeNull()
	})

	it('reads Lexicon, then rules, then Tone', () => {
		const content = said(houseMessage(house)!)

		expect(content.indexOf('the Beat')).toBeLessThan(
			content.indexOf('Never open on a rhetorical question.'),
		)
		expect(content.indexOf('Never open on a rhetorical question.')).toBeLessThan(
			content.indexOf('reported feature'),
		)
		expect(content).toContain('warm, plain')
	})

	// A `system` message after the first is not portable across providers, which
	// is the reason `planMessage` gives for the same choice.
	it('rides as a user message', () => {
		expect(houseMessage(house)!.role).toBe('user')
	})
})

describe('the Chat pack', () => {
	const conversation: ModelMessage[] = [
		{ role: 'user', content: 'What should I do with the Beat piece?' },
	]

	it('puts the House in front of the conversation and the Plan', () => {
		const pack = chatPackMessages(conversation, makePlan(), house)

		expect(said(pack[0])).toContain('the Beat')
		expect(said(pack[1])).toContain('The Plan for this Article')
	})

	it('leaves the pack as it was where the House holds nothing', () => {
		expect(chatPackMessages(conversation, makePlan())).toHaveLength(2)
	})

	it('leaves out a term the turn never invokes', () => {
		const quiet: ModelMessage[] = [{ role: 'user', content: 'What should I cut?' }]
		const pack = chatPackMessages(quiet, makePlan(), {
			...house,
			rules: [],
			tone: {},
		})

		expect(said(pack[0])).not.toContain('the Beat')
	})

	it('takes a term the Plan invokes even where nobody said it', () => {
		const quiet: ModelMessage[] = [{ role: 'user', content: 'What should I cut?' }]
		const plan = makePlan({
			outline: [makeNode({ id: 'n1', title: 'Working the Beat' })],
		})
		const pack = chatPackMessages(quiet, plan, { ...house, rules: [], tone: {} })

		expect(said(pack[0])).toContain('A subject I cover over time.')
	})
})

describe('the Review pack', () => {
	it('puts the House in front of the Plan', () => {
		const pack = reviewPackMessages({
			plan: makePlan(),
			blocks: [],
			notes: [],
			prompt: 'Is the Beat coming through?',
			house,
		})

		expect(said(pack[0])).toContain('the Beat')
		expect(said(pack[1])).toContain('The Plan for this Article')
		expect(said(pack[pack.length - 1])).toContain('The writer asks')
	})

	it('leaves the pack as it was where no House is passed', () => {
		const pack = reviewPackMessages({
			plan: makePlan(),
			blocks: [],
			notes: [],
			prompt: 'Anything to cut?',
		})

		expect(said(pack[0])).toContain('The Plan for this Article')
	})
})
