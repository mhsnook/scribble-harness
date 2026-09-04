import { describe, expect, it } from 'vitest'

import {
	addReference,
	addSection,
	deleteReference,
	deleteSection,
	liftSection,
	moveSection,
	nestSection,
	placeReference,
	setAdjectives,
	setIntent,
	setReference,
	setTarget,
	setTitle,
	setVoice,
} from '../../src/client/plan/edits'
import { outlineEntries } from '../../src/client/plan/outline'
import type { Plan, ProposalInput } from '../../src/shared/plan'
import { applyProposal } from '../../src/shared/plan'
import { makeNode, makePlan, makeReference } from '../shared/plan-fixtures'

/** Apply an edit the way the Panel does, and fail loudly on a refusal. */
function applied(plan: Plan, ops: ProposalInput | null): Plan {
	if (ops === null) throw new Error('The edit was not built.')

	const result = applyProposal(plan, ops)
	if (!result.ok) throw new Error(result.refusal.message)

	return result.plan
}

function threeSections(): Plan {
	return makePlan({
		totalTarget: 1200,
		outline: [
			makeNode({ id: 'a', title: 'A' }),
			makeNode({ id: 'b', title: 'B' }),
			makeNode({ id: 'c', title: 'C' }),
		],
	})
}

const ids = (plan: Plan) => outlineEntries(plan.outline).map((entry) => entry.node.id)

describe('the fields', () => {
	it('retitles the Article and a Section', () => {
		const plan = threeSections()

		expect(applied(plan, setTitle(plan, null, 'The new title')).title).toBe(
			'The new title',
		)
		expect(applied(plan, setTitle(plan, 'b', 'Bee')).outline[1].title).toBe('Bee')
	})

	it('writes an intent note and clears it by absence', () => {
		const plan = threeSections()

		const noted = applied(plan, setIntent(plan, 'a', 'What this Section does'))
		expect(noted.outline[0].intent).toBe('What this Section does')

		const cleared = applied(noted, setIntent(noted, 'a', null))
		expect('intent' in cleared.outline[0]).toBe(false)
	})

	it('sets the Article total and a Section target', () => {
		const plan = threeSections()

		expect(applied(plan, setTarget(plan, null, 2400)).totalTarget).toBe(2400)
		expect(applied(plan, setTarget(plan, 'a', 400)).outline[0].target).toBe(400)
		expect(applied(plan, setTarget(plan, null, null)).totalTarget).toBeNull()
	})

	it('replaces a Voice and accumulates Adjectives', () => {
		const plan = threeSections()

		const spoken = applied(plan, setVoice(plan, 'a', 'Explainer'))
		expect(spoken.outline[0].voice).toBe('Explainer')

		const described = applied(spoken, setAdjectives(spoken, 'a', ['wry', 'somber']))
		expect(described.outline[0].adjectives).toEqual(['wry', 'somber'])

		// A Section states no Adjectives by carrying no key at all — `docs/plan.md`.
		const emptied = applied(described, setAdjectives(described, 'a', []))
		expect('adjectives' in emptied.outline[0]).toBe(false)
	})

	it('reads expected out of the Plan, so the writer never goes Stale', () => {
		const plan = threeSections()
		const once = applied(plan, setTitle(plan, 'b', 'Be'))

		// The second edit is built against the Plan the first one produced, which
		// is what the Panel holds.
		expect(applied(once, setTitle(once, 'b', 'Bee')).outline[1].title).toBe('Bee')
	})
})

describe('the structure', () => {
	it('adds a Section last and a Subsection under one', () => {
		const plan = threeSections()

		const added = applied(plan, addSection({ parentId: null, beforeId: null }, 'd'))
		expect(ids(added)).toEqual(['a', 'b', 'c', 'd'])
		expect(added.outline[3].title).toBe('')

		const nested = applied(added, addSection({ parentId: 'b', beforeId: null }, 'b1'))
		expect(ids(nested)).toEqual(['a', 'b', 'b1', 'c', 'd'])
	})

	it('reorders without touching an id', () => {
		const plan = threeSections()

		const up = applied(plan, moveSection(plan, 'c', 'up'))
		expect(ids(up)).toEqual(['a', 'c', 'b'])

		const down = applied(up, moveSection(up, 'a', 'down'))
		expect(ids(down)).toEqual(['c', 'a', 'b'])

		// The same three Sections throughout, and the titles rode along with them.
		expect(down.outline.map((node) => node.title)).toEqual(['C', 'A', 'B'])
	})

	it('offers no move past either end', () => {
		const plan = threeSections()

		expect(moveSection(plan, 'a', 'up')).toBeNull()
		expect(moveSection(plan, 'c', 'down')).toBeNull()
		expect(moveSection(plan, 'gone', 'up')).toBeNull()
	})

	it('nests a Section and lifts it back, keeping its id', () => {
		const plan = threeSections()

		const nested = applied(plan, nestSection(plan, 'b'))
		expect(ids(nested)).toEqual(['a', 'b', 'c'])
		expect(nested.outline[0].children.map((node) => node.id)).toEqual(['b'])

		const lifted = applied(nested, liftSection(nested, 'b'))
		expect(lifted.outline.map((node) => node.id)).toEqual(['a', 'b', 'c'])
	})

	it('offers no third level, and no nest with nothing above', () => {
		const plan = applied(
			threeSections(),
			addSection({ parentId: 'b', beforeId: null }, 'b1'),
		)

		// b1 is a Subsection already, and nesting it again would make the writer
		// think in trees — context.md, **Subsection**.
		expect(nestSection(plan, 'b1')).toBeNull()
		// b carries a Subsection, which would go a level too deep with it.
		expect(nestSection(plan, 'b')).toBeNull()
		expect(nestSection(plan, 'a')).toBeNull()
		expect(liftSection(plan, 'a')).toBeNull()
	})

	it('unplaces the References of a Section it deletes', () => {
		const plan = makePlan({
			outline: [makeNode({ id: 'a' }), makeNode({ id: 'b' })],
			references: [
				makeReference({ id: 'r1', text: 'A passage', nodeId: 'a' }),
				makeReference({ id: 'r2', text: 'Another', nodeId: 'b' }),
			],
		})

		const deleted = applied(plan, deleteSection('a'))
		expect(ids(deleted)).toEqual(['b'])
		expect(deleted.references.map((reference) => reference.nodeId)).toEqual([null, 'b'])
	})
})

describe('the References', () => {
	const plan = makePlan({
		outline: [makeNode({ id: 'a' })],
		references: [makeReference({ id: 'r1', text: 'A passage' })],
	})

	it('places one at a Section and takes it off again', () => {
		const placed = applied(plan, placeReference(plan, 'r1', 'a'))
		expect(placed.references[0].nodeId).toBe('a')

		const unplaced = applied(placed, placeReference(placed, 'r1', null))
		expect(unplaced.references[0].nodeId).toBeNull()
	})

	it('builds no edit for a Reference the Plan does not carry', () => {
		expect(placeReference(plan, 'gone', 'a')).toBeNull()
		expect(setReference(plan, 'gone', { type: 'link', text: 'A passage' })).toBeNull()
	})

	it('pastes one in, carrying the writer as its Provenance', () => {
		const pasted = applied(
			plan,
			addReference(
				{ type: 'quote', text: 'A passage they pasted', source: { title: 'The memo' } },
				'a',
				'r2',
			),
		)

		expect(pasted.references).toHaveLength(2)
		expect(pasted.references[1]).toEqual({
			id: 'r2',
			type: 'quote',
			provenance: { type: 'writer' },
			text: 'A passage they pasted',
			source: { title: 'The memo' },
			nodeId: 'a',
		})
	})

	it('rewrites what one says, and deletes it', () => {
		const fixed = applied(
			plan,
			setReference(plan, 'r1', { type: 'quote', text: 'A passage, corrected' }),
		)
		expect(fixed.references[0].text).toBe('A passage, corrected')
		expect(fixed.references[0].type).toBe('quote')

		expect(applied(fixed, deleteReference('r1')).references).toEqual([])
	})
})
