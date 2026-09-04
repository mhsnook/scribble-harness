import { describe, expect, it } from 'vitest'

import {
	fromHouseTone,
	fromLexiconEntry,
	fromRule,
	fromSkill,
	HOUSE_TONE_ID,
	type LexiconEntry,
	lexiconInPlay,
	nextRuleOrd,
	ordBetween,
	sortLexicon,
	sortRules,
	type StandingRule,
	toHouseTone,
	toLexiconEntry,
	toRule,
	toSkill,
	writerProvenance,
} from '../../src/shared/house'

/** The House's shapes and the reads over them — `docs/house.md`. */

function entry(term: string, definition = `what ${term} means`): LexiconEntry {
	return {
		id: `x-${term}`,
		term,
		definition,
		provenance: writerProvenance(),
		createdAt: 1,
		updatedAt: 1,
	}
}

function rule(id: string, ord: number): StandingRule {
	return { id, ord, body: `rule ${id}`, createdAt: 1, updatedAt: 1 }
}

describe('the row mappers', () => {
	it('carries a Lexicon entry through a row and back', () => {
		const written = entry('the Beat')

		expect(toLexiconEntry(fromLexiconEntry(written))).toEqual(written)
	})

	it('carries a rule and a Skill through a row and back', () => {
		const written = rule('r1', 2)
		const skill = {
			id: 's1',
			name: 'Cuts',
			prompt: 'Where can this lose a line?',
			createdAt: 1,
			updatedAt: 2,
		}

		expect(toRule(fromRule(written))).toEqual(written)
		expect(toSkill(fromSkill(skill))).toEqual(skill)
	})

	it('stores Provenance as the JSON a Reference stores', () => {
		expect(JSON.parse(fromLexiconEntry(entry('Beat')).provenance)).toEqual({
			type: 'writer',
		})
	})
})

describe('the House Tone', () => {
	it('reads an unwritten House as stating nothing', () => {
		expect(toHouseTone(undefined)).toEqual({})
	})

	// A Scope says "nothing here" by leaving the field out, and a row says it
	// with null and an empty list — `docs/plan.md` on one spelling per state.
	it('reads a null Voice and an empty list as absent fields', () => {
		expect(toHouseTone({ id: HOUSE_TONE_ID, voice: null, adjectives: '[]' })).toEqual({})
	})

	it('carries terms through a row and back', () => {
		const tone = { voice: 'reported feature', adjectives: ['warm', 'plain'] }

		expect(toHouseTone(fromHouseTone(tone))).toEqual(tone)
	})

	it('writes the one row under the House id', () => {
		expect(fromHouseTone({}).id).toBe(HOUSE_TONE_ID)
	})
})

describe('the reading order', () => {
	it('reads the Lexicon alphabetically and the rules as the writer ordered them', () => {
		expect(sortLexicon([entry('Beat'), entry('Arc')]).map((held) => held.term)).toEqual([
			'Arc',
			'Beat',
		])
		expect(sortRules([rule('b', 2), rule('a', 1)]).map((held) => held.id)).toEqual([
			'a',
			'b',
		])
	})

	it('appends a rule after the last one', () => {
		expect(nextRuleOrd([rule('a', 1), rule('b', 4)])).toBe(5)
		expect(nextRuleOrd([])).toBe(1)
	})

	it('places a moved rule between its new neighbours', () => {
		expect(ordBetween(1, 2)).toBe(1.5)
		expect(ordBetween(undefined, 2)).toBe(1)
		expect(ordBetween(4, undefined)).toBe(5)
		expect(ordBetween(undefined, undefined)).toBe(1)
	})
})

describe('the Lexicon entries in play', () => {
	const lexicon = [entry('Beat'), entry('the Ledger'), entry('C++')]

	it('takes the terms the text invokes and leaves the rest', () => {
		const inPlay = lexiconInPlay(lexicon, ['I am filing this to my Beat on housing.'])

		expect(inPlay.map((held) => held.term)).toEqual(['Beat'])
	})

	it('ignores the case the term was typed in', () => {
		expect(lexiconInPlay(lexicon, ['a beat piece']).map((held) => held.term)).toEqual([
			'Beat',
		])
	})

	// The whole point of the boundary: a Lexicon term that is a common word
	// stem would otherwise reach every prompt.
	it('does not fire on a longer word that starts the same way', () => {
		expect(lexiconInPlay(lexicon, ['a beaten path'])).toEqual([])
	})

	it('matches a multi-word term and one carrying punctuation', () => {
		const inPlay = lexiconInPlay(lexicon, ['the Ledger', 'written in C++ back then'])

		expect(inPlay.map((held) => held.term)).toEqual(['C++', 'the Ledger'])
	})

	it('reads every text it is given as one body', () => {
		expect(lexiconInPlay(lexicon, ['nothing here', 'the Ledger']).length).toBe(1)
	})

	it('takes nothing from an empty Lexicon or an empty text', () => {
		expect(lexiconInPlay([], ['Beat'])).toEqual([])
		expect(lexiconInPlay(lexicon, [''])).toEqual([])
	})
})
