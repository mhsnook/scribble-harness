import { describe, expect, it } from 'vitest'

import { blockOrdinals, blockText } from '../../src/shared/draft'
import { noteContentSchema, readAnchor, settleAnchor } from '../../src/shared/note'

const known = { blockIds: ['b1', 'b2', 'b3'] }

describe('settling a Note anchor', () => {
	it('expands a run to every Block in its span', () => {
		expect(
			settleAnchor({ kind: 'blocks', blockIds: ['b1', 'gone', 'b3'] }, known),
		).toEqual({
			kind: 'blocks',
			blockIds: ['b1', 'b2', 'b3'],
		})
	})

	it('reads the span off the Draft order, not the order the ends were named in', () => {
		expect(settleAnchor({ kind: 'blocks', blockIds: ['b3', 'b1'] }, known)).toEqual({
			kind: 'blocks',
			blockIds: ['b1', 'b2', 'b3'],
		})
	})

	it('keeps a single paragraph single', () => {
		expect(settleAnchor({ kind: 'blocks', blockIds: ['b2'] }, known)).toEqual({
			kind: 'blocks',
			blockIds: ['b2'],
		})
	})

	it('drops a run naming nothing at all to the whole piece', () => {
		expect(settleAnchor({ kind: 'blocks', blockIds: ['gone'] }, known)).toEqual({
			kind: 'article',
		})
	})

	it('leaves the whole piece alone', () => {
		expect(settleAnchor({ kind: 'article' }, known)).toEqual({ kind: 'article' })
	})
})

describe('what the Guide may write', () => {
	it('refuses a Note with no body', () => {
		const written = noteContentSchema.safeParse({
			type: 'repetition',
			anchor: { kind: 'article' },
			body: '',
		})

		expect(written.success).toBe(false)
	})

	it('refuses an anchor of a kind that does not exist', () => {
		const written = noteContentSchema.safeParse({
			type: 'repetition',
			anchor: { kind: 'sentence', at: 4 },
			body: 'Said twice.',
		})

		expect(written.success).toBe(false)
	})

	it('refuses a Section, which is no longer somewhere a Note may point', () => {
		const written = noteContentSchema.safeParse({
			type: 'plan divergence',
			anchor: { kind: 'section', nodeId: 'n1' },
			body: 'The Plan asks for costs here.',
		})

		expect(written.success).toBe(false)
	})

	it('refuses a run anchored to nothing', () => {
		const written = noteContentSchema.safeParse({
			type: 'repetition',
			anchor: { kind: 'blocks', blockIds: [] },
			body: 'Said twice.',
		})

		expect(written.success).toBe(false)
	})
})

describe('reading the Draft for a prompt', () => {
	it('pulls the text out of a nested document', () => {
		const paragraph = {
			type: 'paragraph',
			content: [
				{ type: 'text', text: 'Two supporting points ' },
				{ type: 'text', marks: [{ type: 'bold' }], text: 'carry the piece' },
				{ type: 'text', text: '.' },
			],
		}

		expect(blockText(paragraph)).toBe('Two supporting points carry the piece.')
	})

	it('reads a Block with no text as an empty string', () => {
		expect(blockText({ type: 'horizontalRule' })).toBe('')
	})

	it('numbers the Blocks by reading order, not by their fractional index', () => {
		const blocks = [
			{ id: 'b1', ord: 0.5, json: { type: 'paragraph' } },
			{ id: 'b2', ord: 4, json: { type: 'paragraph' } },
			{ id: 'b3', ord: 4.25, json: { type: 'paragraph' } },
		]

		expect([...blockOrdinals(blocks)]).toEqual([
			['b1', 1],
			['b2', 2],
			['b3', 3],
		])
	})
})

describe('reading a stored anchor', () => {
	it('reads back what was written', () => {
		expect(readAnchor('{"kind":"blocks","blockIds":["b1","b2"]}')).toEqual({
			kind: 'blocks',
			blockIds: ['b1', 'b2'],
		})
	})

	it('opens a Note written when a Section was somewhere a Note could point', () => {
		expect(readAnchor('{"kind":"section","nodeId":"n1"}')).toEqual({ kind: 'article' })
	})

	it('opens a Note whose anchor is not JSON at all', () => {
		expect(readAnchor('not json')).toEqual({ kind: 'article' })
	})
})
