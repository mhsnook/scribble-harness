import { describe, expect, it } from 'vitest'

import type { OutlineNode } from '../../src/shared/plan'
import {
	emptyPlan,
	planSchema,
	referenceSchema,
	sourceSchema,
} from '../../src/shared/plan'
import { makeNode, makePlan, makeReference } from './plan-fixtures'

/** The path of the first issue, joined — what the UI would point at. */
function firstIssuePath(result: ReturnType<typeof planSchema.safeParse>) {
	return result.error?.issues[0]?.path.join('.')
}

describe('the Plan schema', () => {
	it('accepts the empty Plan a new Article opens into', () => {
		expect(planSchema.safeParse(emptyPlan()).success).toBe(true)
	})

	it('accepts a Plan with a nested Outline and a placed Reference', () => {
		const plan = makePlan({
			totalTarget: 2000,
			voice: 'reported feature',
			adjectives: ['funny'],
			outline: [
				makeNode({
					id: 'n1',
					target: 800,
					children: [makeNode({ id: 'n1a', intent: 'Set the scene' })],
				}),
				makeNode({ id: 'n2' }),
			],
			references: [makeReference({ id: 'r1', nodeId: 'n1a', text: 'A pulled passage.' })],
		})

		expect(planSchema.safeParse(plan).success).toBe(true)
	})

	it('rejects an unknown key, because only the client writes the blob', () => {
		const plan = { ...emptyPlan(), resolvedVoice: 'reported feature' }

		expect(planSchema.safeParse(plan).success).toBe(false)
	})

	it('rejects a missing totalTarget, and accepts a stated null', () => {
		const { totalTarget: _omitted, ...withoutTotal } = emptyPlan()

		expect(planSchema.safeParse(withoutTotal).success).toBe(false)
		expect(planSchema.safeParse({ ...withoutTotal, totalTarget: null }).success).toBe(
			true,
		)
	})

	it('rejects a word-count target that is not a positive whole number', () => {
		expect(planSchema.safeParse(makePlan({ totalTarget: 0 })).success).toBe(false)
		expect(planSchema.safeParse(makePlan({ totalTarget: -400 })).success).toBe(false)
		expect(planSchema.safeParse(makePlan({ totalTarget: 1200.5 })).success).toBe(false)
	})

	it('rejects an empty Voice or Adjective, which are absence spelled twice', () => {
		expect(planSchema.safeParse(makePlan({ voice: '' })).success).toBe(false)
		expect(planSchema.safeParse(makePlan({ adjectives: [''] })).success).toBe(false)
	})

	it('accepts a Section with an empty title, because one is typed after it is made', () => {
		const plan = makePlan({ outline: [makeNode({ id: 'n1', title: '' })] })

		expect(planSchema.safeParse(plan).success).toBe(true)
	})

	it('rejects a Section with no id', () => {
		const plan = makePlan({ outline: [makeNode({ id: '' })] })

		expect(planSchema.safeParse(plan).success).toBe(false)
	})

	it('holds a Section to the same field rules as the Plan', () => {
		const withNode = (fields: Partial<OutlineNode>) =>
			planSchema.safeParse(makePlan({ outline: [makeNode({ id: 'n1', ...fields })] }))
				.success

		expect(withNode({ target: 0 })).toBe(false)
		expect(withNode({ target: 120.5 })).toBe(false)
		expect(withNode({ voice: '' })).toBe(false)
		expect(withNode({ adjectives: [''] })).toBe(false)
		expect(withNode({ intent: '' })).toBe(false)
	})

	it('gives a node one way to say it states no Adjectives, and it is not the empty list', () => {
		const withAdjectives = (adjectives?: string[]) =>
			planSchema.safeParse(makePlan({ outline: [makeNode({ id: 'n1', adjectives })] }))
				.success

		expect(withAdjectives(undefined)).toBe(true)
		expect(withAdjectives([])).toBe(false)
		// The Article carries the key either way, so there the empty list is it.
		expect(planSchema.safeParse(makePlan({ adjectives: [] })).success).toBe(true)
	})

	it('rejects an invalid node however deep it sits', () => {
		const plan = makePlan({
			outline: [
				makeNode({
					id: 'n1',
					children: [
						makeNode({ id: 'n1a', children: [makeNode({ id: 'deep', target: -100 })] }),
					],
				}),
			],
		})
		const result = planSchema.safeParse(plan)

		expect(result.success).toBe(false)
		expect(firstIssuePath(result)).toBe('outline.0.children.0.children.0.target')
	})

	it('rejects two Sections carrying one id, however deep', () => {
		const plan = makePlan({
			outline: [
				makeNode({ id: 'n1', children: [makeNode({ id: 'shared' })] }),
				makeNode({ id: 'shared' }),
			],
		})
		const result = planSchema.safeParse(plan)

		expect(result.success).toBe(false)
		expect(firstIssuePath(result)).toBe('outline.1.id')
	})

	it('rejects two References carrying one id', () => {
		const plan = makePlan({
			references: [
				makeReference({ id: 'r1', text: 'One' }),
				makeReference({ id: 'r1', text: 'Another' }),
			],
		})
		const result = planSchema.safeParse(plan)

		expect(result.success).toBe(false)
		expect(firstIssuePath(result)).toBe('references.1.id')
	})

	it('rejects a Reference placed at a Section that is not there', () => {
		const plan = makePlan({
			outline: [makeNode({ id: 'n1' })],
			references: [
				makeReference({ id: 'r1', nodeId: 'gone', text: 'A pulled passage.' }),
			],
		})
		const result = planSchema.safeParse(plan)

		expect(result.success).toBe(false)
		expect(firstIssuePath(result)).toBe('references.0.nodeId')
	})
})

describe('the Reference invariant', () => {
	const base = makeReference({ id: 'r1' })

	it('accepts a Reference carrying only a text', () => {
		const result = referenceSchema.safeParse({ ...base, text: 'They knew by March.' })

		expect(result.success).toBe(true)
	})

	it('accepts a Quote, which is a Reference of that type carrying a text', () => {
		const result = referenceSchema.safeParse({
			...base,
			type: 'quote',
			text: 'They knew by March.',
		})

		expect(result.success).toBe(true)
	})

	// The type is stored rather than read off the text, so a text does not make
	// a Reference a Quote and the two Panels cannot disagree about which it is.
	it('leaves a Reference carrying a text a Reference, not a Quote', () => {
		const result = referenceSchema.safeParse({ ...base, text: 'They knew by March.' })

		expect(result.success && result.data.type).toBe('link')
	})

	it('rejects a Quote carrying no text', () => {
		const result = referenceSchema.safeParse({
			...base,
			type: 'quote',
			source: { publication: 'The Guardian', year: 2024 },
		})

		expect(result.success).toBe(false)
	})

	it('accepts a Reference carrying only a source', () => {
		const result = referenceSchema.safeParse({
			...base,
			source: { publication: 'The Guardian', year: 2024 },
		})

		expect(result.success).toBe(true)
	})

	it('accepts a Reference carrying both', () => {
		const result = referenceSchema.safeParse({
			...base,
			text: 'They knew by March.',
			source: { author: 'A. Reporter', url: 'https://example.test/piece' },
		})

		expect(result.success).toBe(true)
	})

	it('rejects a Reference carrying neither, because it is nothing', () => {
		expect(referenceSchema.safeParse(base).success).toBe(false)
	})

	it('rejects a source with every field absent, which is neither by another route', () => {
		expect(sourceSchema.safeParse({}).success).toBe(false)
		expect(referenceSchema.safeParse({ ...base, source: {} }).success).toBe(false)
	})

	it('rejects a source url that is not a url', () => {
		expect(sourceSchema.safeParse({ url: 'not a url' }).success).toBe(false)
	})

	it('rejects a Provenance that names an Offer without naming which', () => {
		const result = referenceSchema.safeParse({
			...base,
			text: 'They knew by March.',
			provenance: { type: 'offer' },
		})

		expect(result.success).toBe(false)
	})

	it('accepts an Accepted Offer copied in with its Provenance', () => {
		const result = referenceSchema.safeParse({
			...base,
			text: 'They knew by March.',
			provenance: { type: 'offer', offerId: 'o1' },
		})

		expect(result.success).toBe(true)
	})

	// One Offer becomes one Reference — `docs/chat.md`.
	it('refuses two References copied from one Offer', () => {
		const twice = makePlan({
			references: [
				makeReference({
					id: 'r1',
					text: 'Forty separate times.',
					provenance: { type: 'offer', offerId: 'o1' },
				}),
				makeReference({
					id: 'r2',
					text: 'Forty separate times.',
					provenance: { type: 'offer', offerId: 'o1' },
				}),
			],
		})

		const result = planSchema.safeParse(twice)

		expect(result.success).toBe(false)
		expect(firstIssuePath(result)).toBe('references.1.provenance.offerId')
		expect(result.error?.issues[0]?.message).toContain('copied from the Offer o1')
	})

	it('takes two References the writer wrote, which name no Offer', () => {
		const both = makePlan({
			references: [
				makeReference({ id: 'r1', source: { title: 'One' } }),
				makeReference({ id: 'r2', source: { title: 'Another' } }),
			],
		})

		expect(planSchema.safeParse(both).success).toBe(true)
	})
})
