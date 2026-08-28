import { SELF } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'

import type { Round } from '../../src/shared/review'
import type { NoteRow, OfferRow } from '../../src/shared/sync'
import { answers, ask, response, settled } from './review-fixtures'
import { inAgent, scriptModel } from './scripted'
import { isBatch, openSyncSocket, postWrite } from './sync-socket'

/**
 * The party-db room composed into the Article Agent — architecture.md §12: a
 * subscriber sees Notes, Rounds and Offers land as the Guide commits them and
 * nothing else, an app socket sees no batches, a reconnect catches up from
 * `?since`, and a client collection write is refused.
 */

/** What one research turn offers. */
const found = [
	{
		type: 'quote' as const,
		text: 'We did not decide to stop building.',
		source: { title: 'Permit throughput in six mid-sized cities', year: 2023 },
	},
]

/** Run one scripted Review to its settled Round. */
async function reviewed(name: string): Promise<Round> {
	// A plain GET runs the cold Agent's onStart, the way the app's wake does —
	// `runInDurableObject` alone reaches an instance whose tables don't exist.
	await SELF.fetch(`https://harness.test/agents/article-agent/${name}`)
	await scriptModel(name, 'reviewModel', answers(response({ kind: 'article' })))
	await inAgent(name, (agent) => agent.startReview(ask))

	const round = await settled(name)
	expect(round.state).toBe('done')

	return round
}

describe('the sync socket', () => {
	it('hands a fresh subscriber the snapshot', async () => {
		await reviewed('sync-snapshot')

		const reader = await openSyncSocket('sync-snapshot')
		const notes = await reader.next('note')
		const rounds = await reader.next('round')

		// A snapshot replaces the channel and closes the backlog.
		expect(notes).toMatchObject({ reset: true, ready: true })
		expect(rounds).toMatchObject({ reset: true, ready: true })

		expect(notes.ops).toHaveLength(1)
		const note = notes.ops[0].value as NoteRow
		expect(note).toMatchObject({ disposition: 'proposed', body: 'Cut to a clause.' })
		// The anchor column travels as the JSON text it stores.
		expect(JSON.parse(note.anchor)).toEqual({ kind: 'article' })

		expect(rounds.ops).toHaveLength(1)
		expect(rounds.ops[0].value).toMatchObject({ state: 'done' })
	})

	it('carries each write to a connected subscriber, and nothing else', async () => {
		const reader = await openSyncSocket('sync-live')

		// A room nobody has written in answers the connect with empty snapshots.
		expect((await reader.next('note')).ops).toEqual([])
		expect((await reader.next('round')).ops).toEqual([])

		await scriptModel('sync-live', 'reviewModel', answers(response({ kind: 'article' })))
		const started = await inAgent('sync-live', (agent) => agent.startReview(ask))

		// The Round starts as an insert...
		const running = await reader.next('round')
		expect(running.ops[0]).toMatchObject({
			type: 'insert',
			value: { id: started.id, state: 'running' },
		})

		// ...its Notes land as inserts, and the settle follows as an update.
		const notes = await reader.next('note')
		expect(notes.ops[0]).toMatchObject({
			type: 'insert',
			value: { disposition: 'proposed' },
		})

		const done = await reader.next('round')
		expect(done.ops[0]).toMatchObject({
			type: 'update',
			value: { id: started.id, state: 'done' },
		})

		// A sync subscriber hears SequencedBatch frames and nothing else: no
		// handshake, no state sync, no Chat traffic.
		const { strays } = await reader.settled()
		expect(strays).toEqual([])
	})

	it('sends an app connection none of it', async () => {
		// An app socket on the same Article, opened without the proto marker.
		const socket = (
			await SELF.fetch('https://harness.test/agents/article-agent/sync-apart', {
				headers: { Upgrade: 'websocket' },
			})
		).webSocket
		if (!socket) throw new Error('The Agent route did not answer with a socket.')
		socket.accept()

		const frames: unknown[] = []
		socket.addEventListener('message', (event) => {
			frames.push(JSON.parse(event.data as string))
		})

		await reviewed('sync-apart')

		// The handshake arrived, proving the socket lives — and no batch did.
		await vi.waitFor(() => expect(frames.length).toBeGreaterThan(0))
		expect(frames.filter(isBatch)).toEqual([])
	})

	it('catches a reconnecting subscriber up from its ?since cursor', async () => {
		await reviewed('sync-since')

		// The cursor a client held when it dropped: the snapshot's seq.
		const reader = await openSyncSocket('sync-since')
		const seq = (await reader.next('round')).seq as number

		// A ruling lands while it is away.
		const note = await inAgent('sync-since', async (agent) => {
			const notes = agent.listNotes()
			return agent.setNoteDisposition(notes[0].id, 'accepted')
		})

		// The reconnect replays exactly what was missed — a delta, not a snapshot.
		const back = await openSyncSocket('sync-since', seq)
		const missed = await back.next('note')
		expect(missed.reset).toBeUndefined()
		expect(missed.ops[0]).toMatchObject({
			type: 'update',
			value: { id: note.id, disposition: 'accepted' },
		})

		// A cursor already at the head replays nothing.
		const caughtUp = await openSyncSocket('sync-since', missed.seq as number)
		const { batches } = await caughtUp.settled()
		expect(batches).toEqual([])
	})

	it('refuses a client collection write', async () => {
		await reviewed('sync-no-writes')

		const answer = await postWrite('sync-no-writes', [
			{
				channel: 'note',
				ops: [{ type: 'update', value: { id: 'forged', disposition: 'accepted' } }],
			},
		])

		expect(answer.status).toBe(403)

		// The guards held: the row the Guide wrote is still proposed.
		const notes = await inAgent('sync-no-writes', (agent) => agent.listNotes())
		expect(notes[0].disposition).toBe('proposed')
	})
})

describe('the Offer collection on the sync socket', () => {
	it('carries a research turn to a subscriber that never asked for it', async () => {
		await SELF.fetch('https://harness.test/agents/article-agent/sync-offers')
		const reader = await openSyncSocket('sync-offers')
		expect((await reader.next('offer')).ops).toEqual([])

		// A research turn writes behind the client's back — nothing on the app
		// socket announces it, and nothing has to.
		const [recorded] = await inAgent('sync-offers', (agent) => agent.recordOffers(found))

		const written = await reader.next('offer')
		expect(written.ops[0]).toMatchObject({
			type: 'insert',
			value: { id: recorded.offer.id, disposition: 'undecided', decided_at: null },
		})
		// The source column travels as the JSON text it stores.
		const row = written.ops[0].value as OfferRow
		expect(JSON.parse(row.source ?? 'null')).toEqual(found[0].source)
	})

	it('carries a ruling back to every subscriber', async () => {
		await SELF.fetch('https://harness.test/agents/article-agent/sync-rulings')
		const [recorded] = await inAgent('sync-rulings', (agent) => agent.recordOffers(found))

		// Two clients on one Article: the one that did not rule hears it too.
		const ruling = await openSyncSocket('sync-rulings')
		const other = await openSyncSocket('sync-rulings')
		await ruling.next('offer')
		await other.next('offer')

		await inAgent('sync-rulings', (agent) =>
			agent.setOfferDisposition(recorded.offer.id, 'declined'),
		)

		for (const reader of [ruling, other]) {
			const declined = await reader.next('offer')
			expect(declined.ops[0]).toMatchObject({
				type: 'update',
				value: { id: recorded.offer.id, disposition: 'declined' },
			})
		}

		await inAgent('sync-rulings', (agent) => agent.restoreOffer(recorded.offer.id))

		const restored = await other.next('offer')
		expect(restored.ops[0]).toMatchObject({
			type: 'update',
			value: { disposition: 'undecided', decided_at: null },
		})
	})
})
