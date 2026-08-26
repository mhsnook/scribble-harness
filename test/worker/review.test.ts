import { MockLanguageModelV3 } from 'ai/test'
import { describe, expect, it } from 'vitest'

import { makeNode, makePlan } from '../shared/plan-fixtures'
import { openAgentSocket } from './agent-socket'
import { answers, ask, response, settled } from './review-fixtures'
import { inAgent, scriptModel } from './scripted'

/**
 * The Review, end to end inside the Article Agent — `docs/architecture.md` §3,
 * §7, and §12. What these drive is `reviewModel()`, replaced with a scripted
 * one — `scripted.ts` for why no test calls a real model.
 */

/** A model that fails the way a provider outage does. */
function fails(why: string) {
	return new MockLanguageModelV3({
		doGenerate: async () => {
			throw new Error(why)
		},
	})
}

/** A model that answers nothing until `release` is called — a Review a restart
 * would catch in flight. */
function stalls() {
	let release = () => {}
	const gate = new Promise<void>((resolve) => {
		release = resolve
	})

	return {
		release,
		model: new MockLanguageModelV3({
			doGenerate: async () => {
				await gate

				throw new Error('The stalled call was released.')
			},
		}),
	}
}

/** Put a scripted model behind the Review's model boundary. */
const scriptReview = (name: string, model: MockLanguageModelV3) =>
	scriptModel(name, 'reviewModel', model)

const plan = makePlan({
	title: 'The permit queue',
	outline: [makeNode({ id: 'n1', title: 'The opening' })],
})

const blocks = [
	{
		id: 'b1',
		ord: 1,
		json: { type: 'paragraph', content: [{ type: 'text', text: 'One.' }] },
	},
	{
		id: 'b2',
		ord: 2,
		json: { type: 'paragraph', content: [{ type: 'text', text: 'Two.' }] },
	},
]

describe('running a Review', () => {
	it('answers with a running Round before the model has said anything', async () => {
		await openAgentSocket('review-starts')
		await scriptReview('review-starts', answers(response({ kind: 'article' })))

		const round = await inAgent('review-starts', (agent) => agent.startReview(ask))

		expect(round.state).toBe('running')
		expect(round.ordinal).toBe(1)
		expect(round.prompt).toBe(ask.prompt)
	})

	it('writes the response and its Notes as rows', async () => {
		await openAgentSocket('review-writes')
		await scriptReview(
			'review-writes',
			answers(response({ kind: 'blocks', blockIds: ['b2'] })),
		)
		await inAgent('review-writes', (agent) => {
			agent.saveBlocks({ blocks, removed: [] })
			agent.startReview({ ...ask, plan })
		})

		const round = await settled('review-writes')
		const notes = await inAgent('review-writes', (agent) => agent.listNotes())

		expect(round.state).toBe('done')
		expect(round.passages).toHaveLength(2)
		expect(round.failure).toBeNull()

		// The part names its Notes by id, so the response and the queue are two
		// readings of one set of rows.
		expect(round.passages[0].noteIds).toEqual([notes[0].id])
		expect(round.passages[1].noteIds).toEqual([])

		expect(notes).toHaveLength(1)
		expect(notes[0]).toMatchObject({
			roundId: round.id,
			type: 'repetition',
			label: 're-argued',
			disposition: 'proposed',
			anchor: { kind: 'blocks', blockIds: ['b2'] },
		})
	})

	it('settles an anchor naming a paragraph the Draft does not carry', async () => {
		await openAgentSocket('review-anchor')
		await scriptReview(
			'review-anchor',
			answers(response({ kind: 'blocks', blockIds: ['never-existed'] })),
		)
		await inAgent('review-anchor', (agent) => {
			agent.saveBlocks({ blocks, removed: [] })
			agent.startReview(ask)
		})

		await settled('review-anchor')
		const notes = await inAgent('review-anchor', (agent) => agent.listNotes())

		// Taken rather than refused: an anchor the client cannot resolve reads as
		// the whole piece, and nothing breaks — issue #42's line.
		expect(notes[0].anchor).toEqual({ kind: 'article' })
	})

	it('settles an anchor against the Plan the Review was shown, not the stored one', async () => {
		await openAgentSocket('review-newer-plan')
		await scriptReview(
			'review-newer-plan',
			answers(response({ kind: 'section', nodeId: 'n1' })),
		)

		// The client holds a Section its `setState` has not landed yet, and sends
		// it with the Review — §3, rule 1. Checking the anchor against state would
		// call that Section gone and drop the Note to the whole piece.
		await inAgent('review-newer-plan', (agent) => agent.startReview({ ...ask, plan }))

		await settled('review-newer-plan')
		const notes = await inAgent('review-newer-plan', (agent) => agent.listNotes())

		expect(notes[0].anchor).toEqual({ kind: 'section', nodeId: 'n1' })
	})

	it('records a failure on the Round, where the writer will find it', async () => {
		await openAgentSocket('review-fails')
		await scriptReview('review-fails', fails('The model is having a day.'))
		await inAgent('review-fails', (agent) => agent.startReview(ask))

		const round = await settled('review-fails')

		expect(round.state).toBe('failed')
		expect(round.failure).toContain('The model is having a day.')
		expect(round.passages).toEqual([])
	})

	it('retries a refused answer once, with the error in front of the model', async () => {
		const model = answers('not the shape asked for', response({ kind: 'article' }))
		await openAgentSocket('review-retry')
		await scriptReview('review-retry', model)
		await inAgent('review-retry', (agent) => agent.startReview(ask))

		const round = await settled('review-retry')

		expect(round.state).toBe('done')
		expect(model.doGenerateCalls).toHaveLength(2)
		expect(JSON.stringify(model.doGenerateCalls[1].prompt)).toContain(
			'That response was refused',
		)
	})

	it('does not re-send the pack when the model call itself fails', async () => {
		const model = fails('The model is having a day.')
		await openAgentSocket('review-outage')
		await scriptReview('review-outage', model)
		await inAgent('review-outage', (agent) => agent.startReview(ask))

		const round = await settled('review-outage')

		expect(round.state).toBe('failed')
		expect(model.doGenerateCalls).toHaveLength(1)
	})

	it('fails a Round a restart cut off, instead of blocking every later Review', async () => {
		const stalled = stalls()
		await openAgentSocket('review-reap')
		await scriptReview('review-reap', stalled.model)
		await inAgent('review-reap', (agent) => agent.startReview(ask))

		// The next wake finds the row still running with no call behind it.
		await inAgent('review-reap', (agent) => agent.onStart())

		const round = await settled('review-reap')

		expect(round).toMatchObject({ state: 'failed', ordinal: 1 })
		expect(round.failure).toContain('cut off by a restart')

		// And the one-at-a-time guard is free again.
		await scriptReview('review-reap', answers(response({ kind: 'article' })))
		const next = await inAgent('review-reap', (agent) => agent.startReview(ask))

		expect(next).toMatchObject({ state: 'running', ordinal: 2 })

		stalled.release()
		await settled('review-reap')
	})

	it('runs one Review at a time on an Article', async () => {
		await openAgentSocket('review-one')
		await scriptReview('review-one', answers(response({ kind: 'article' })))

		// Both in flight at once — the double-click. The pre-check cannot close
		// this race on its own, because `startReview` awaits its commit (#9);
		// the `round_one_running` index is what refuses the second insert.
		await expect(
			inAgent('review-one', (agent) =>
				Promise.all([agent.startReview(ask), agent.startReview(ask)]),
			),
		).rejects.toThrow(/still running/)
	})

	it('carries the accepted Notes into the next Review, and nothing else', async () => {
		const model = answers(
			response({ kind: 'article' }),
			response({ kind: 'article' }),
			response({ kind: 'article' }),
		)
		await openAgentSocket('review-bound')
		await scriptReview('review-bound', model)

		// Three Rounds, so there is one Note in each disposition to choose from.
		for (const _ of [1, 2, 3]) {
			await inAgent('review-bound', (agent) => agent.startReview(ask))
			await settled('review-bound')
		}

		const notes = await inAgent('review-bound', (agent) => agent.listNotes())
		await inAgent('review-bound', async (agent) => {
			await agent.setNoteDisposition(notes[0].id, 'accepted')
			await agent.setNoteDisposition(notes[1].id, 'declined')
			await agent.setNoteDisposition(notes[2].id, 'accepted')
			await agent.resolveNote(notes[2].id)
		})

		await inAgent('review-bound', (agent) => agent.startReview(ask))
		await settled('review-bound')

		// The pack's Notes message names only the accepted, unresolved one: a
		// declined Note is the writer saying no, and a resolved one is finished.
		const asked = model.doGenerateCalls[model.doGenerateCalls.length - 1]
		const sent = JSON.stringify(asked.prompt)

		expect(sent).toContain('already accepted from earlier Rounds')
		expect(sent.match(/Cut to a clause/g)).toHaveLength(1)
	})
})

describe('ruling on a Note', () => {
	/** One Article with one proposed Note on it. */
	async function withNote(name: string) {
		await openAgentSocket(name)
		await scriptReview(name, answers(response({ kind: 'article' })))
		await inAgent(name, (agent) => agent.startReview(ask))
		await settled(name)

		const notes = await inAgent(name, (agent) => agent.listNotes())

		return notes[0].id
	}

	it('accepts, resolves, and undoes each move', async () => {
		const id = await withNote('note-accept')

		await expect(
			inAgent('note-accept', (agent) => agent.setNoteDisposition(id, 'accepted')),
		).resolves.toMatchObject({ disposition: 'accepted' })

		await expect(
			inAgent('note-accept', (agent) => agent.resolveNote(id)),
		).resolves.toMatchObject({ disposition: 'resolved' })

		await expect(
			inAgent('note-accept', (agent) => agent.restoreNote(id)),
		).resolves.toMatchObject({ disposition: 'accepted' })
	})

	it('undoes a Decline back to proposed, and clears when it was decided', async () => {
		const id = await withNote('note-decline')

		await inAgent('note-decline', (agent) => agent.setNoteDisposition(id, 'declined'))
		const restored = await inAgent('note-decline', (agent) => agent.restoreNote(id))

		expect(restored).toMatchObject({ disposition: 'proposed', decidedAt: null })
	})

	it('refuses to rule on a Note that has already been ruled on', async () => {
		const id = await withNote('note-twice')

		await inAgent('note-twice', (agent) => agent.setNoteDisposition(id, 'accepted'))

		await expect(
			inAgent('note-twice', (agent) => agent.setNoteDisposition(id, 'declined')),
		).rejects.toThrow(/only a proposed Note is ruled/)
	})

	it('refuses to resolve a Note the writer has not accepted', async () => {
		const id = await withNote('note-resolve')

		await expect(
			inAgent('note-resolve', (agent) => agent.resolveNote(id)),
		).rejects.toThrow(/resolving finishes an accepted Note/)
	})

	it('tells a Note that does not exist from one that cannot move', async () => {
		await withNote('note-missing')

		await expect(
			inAgent('note-missing', (agent) => agent.setNoteDisposition('nope', 'accepted')),
		).rejects.toThrow(/No Note carries the id nope/)
	})
})
