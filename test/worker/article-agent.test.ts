import { evictDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import type { RecordedOffer } from '../../src/server/article-agent'
import { referenceForOffer, referenceFromOffer } from '../../src/shared/ledger'
import type { Offer } from '../../src/shared/offer'
import type { Plan, ReferenceContent } from '../../src/shared/plan'
import { emptyPlan, isPlanRefused } from '../../src/shared/plan'
import { makeNode, makePlan, makeReference } from '../shared/plan-fixtures'
import { openAgentSocket } from './agent-socket'
import { agentStub, inAgent } from './scripted'

/** One research turn, the way the tool will run it: inside the Agent, not over
 * RPC. The Article Agent must already be awake, which every caller here
 * arranges by opening a socket first. */
function recordOffers(name: string, batch: unknown): Promise<RecordedOffer[]> {
	return inAgent(name, (agent) => agent.recordOffers(batch))
}

/** One Offer, as a turn that found one thing. */
async function createOffer(name: string, content: ReferenceContent): Promise<Offer> {
	const [recorded] = await recordOffers(name, [content])

	return recorded.offer
}

/** Every Offer, read inside the Agent. `listOffers` is not `@callable`: a
 * client reads its synced `offer` collection (§12), which `sync.test.ts`
 * covers. */
function listOffers(name: string): Promise<Offer[]> {
	return inAgent(name, (agent) => agent.listOffers())
}

/** The `offer` table as it stood before the fingerprint column, so a test can
 * wake an Agent onto the shape a deployed Article has. Raw SQL against a synced
 * table, which §12 forbids the app — this stands a schema up rather than writing
 * a row the app would write. */
function toOldOfferTable(name: string): Promise<void> {
	return inAgent(name, (agent) => {
		agent.sql`DROP INDEX IF EXISTS offer_one_per_fingerprint`
		agent.sql`ALTER TABLE offer DROP COLUMN fingerprint`
	})
}

/** A Plan that parses: one Section, and one Reference placed at it. */
const plan = makePlan({
	title: 'The permit queue',
	totalTarget: 1200,
	outline: [makeNode({ id: 'n1', title: 'The opening' })],
	references: [makeReference({ id: 'r1', text: 'Forty separate times.', nodeId: 'n1' })],
})

/** The same Plan with its Reference placed at a node no Outline carries. The
 * object shape is valid, so only `planSchema`'s referential check refuses it. */
const orphaned = {
	...plan,
	references: [
		makeReference({ id: 'r1', text: 'Forty separate times.', nodeId: 'gone' }),
	],
}

const quote = {
	type: 'quote' as const,
	text: 'We did not decide to stop building.',
	source: { title: 'Permit throughput in six mid-sized cities', year: 2023 },
}

const reference = {
	type: 'link' as const,
	source: { title: 'Zoning and the missing middle', author: 'A. Weill' },
	note: 'Primary data for the opening figure.',
}

describe('the Plan in Article Agent state', () => {
	it('opens a new Article on the empty Plan', async () => {
		const writer = await openAgentSocket('opens-empty')

		await expect(writer.next('cf_agent_state')).resolves.toMatchObject({
			state: emptyPlan(),
		})
	})

	it('persists a Plan that parses, and broadcasts it to the other connection', async () => {
		const writer = await openAgentSocket('valid-write')
		const reader = await openAgentSocket('valid-write')
		await writer.next('cf_agent_state')
		await reader.next('cf_agent_state')

		writer.setState(plan)

		await expect(reader.next('cf_agent_state')).resolves.toMatchObject({ state: plan })

		const returning = await openAgentSocket('valid-write')
		await expect(returning.next('cf_agent_state')).resolves.toMatchObject({ state: plan })
	})

	it('refuses a Plan that does not parse, and keeps the one it had', async () => {
		const writer = await openAgentSocket('invalid-write')
		const reader = await openAgentSocket('invalid-write')
		await writer.next('cf_agent_state')
		await reader.next('cf_agent_state')
		writer.setState(plan)
		await reader.next('cf_agent_state')

		writer.setState(orphaned)

		await expect(writer.next('cf_agent_state_error')).resolves.toMatchObject({
			type: 'cf_agent_state_error',
		})
		await expect(reader.quiet('cf_agent_state')).resolves.toEqual([])

		const returning = await openAgentSocket('invalid-write')
		await expect(returning.next('cf_agent_state')).resolves.toMatchObject({ state: plan })
	})

	it('tells the writer which rule the refused Plan broke', async () => {
		const writer = await openAgentSocket('refusal-reason')
		await writer.next('cf_agent_state')

		writer.setState(orphaned)

		const frame = await writer.next('plan_refused')

		expect(isPlanRefused(frame)).toBe(true)
		expect(frame.error).toContain('which no Section carries')
	})
})

describe('Offers in the Article Agent', () => {
	// `@callable` is the whole allowlist of what a browser may invoke on this
	// Durable Object, so the set is worth naming — `recordOffers` is absent
	// because only the Chat records an Offer. It also proves the decorator
	// survived the build: oxc does not lower one, and `agents/vite` does.
	it('marks every writer-facing method callable, and nothing else', async () => {
		const methods = await inAgent('callable-set', (agent) => [
			...agent.getCallableMethods().keys(),
		])

		// Exact, so reaching the browser is a decision rather than a side effect
		// of adding a method: `recordOffers` stays off it, because the Guide
		// writes Offers and the writer never authors one.
		// `listNotes`, `listRounds` and `listOffers` are off it too — a client
		// reads all three from its synced collections (§12), not over RPC.
		expect(methods.sort()).toEqual([
			'listBlocks',
			'resolveNote',
			'restoreNote',
			'restoreOffer',
			'saveBlocks',
			'setNoteDisposition',
			'setOfferDisposition',
			'startReview',
		])
	})

	it('records an Offer as Undecided and lists it', async () => {
		await openAgentSocket('offer-create')

		const offer = await createOffer('offer-create', quote)

		expect(offer).toMatchObject({
			type: 'quote',
			disposition: 'undecided',
			decidedAt: null,
		})
		await expect(listOffers('offer-create')).resolves.toEqual([offer])
	})

	// No socket first: parsed before any row is written, so it refuses without
	// the Article Agent reaching its table.
	it('refuses an Offer carrying neither a text nor a source', async () => {
		await expect(
			createOffer('offer-empty', { type: 'link' } as ReferenceContent),
		).rejects.toThrow(/text, a source, or both/)
	})

	it('rules on an Offer, and restores a Declined one', async () => {
		const writer = await openAgentSocket('offer-rulings')
		const offer = await createOffer('offer-rulings', reference)

		const declined = await writer.call<Offer>('setOfferDisposition', offer.id, 'declined')
		expect(declined.disposition).toBe('declined')
		expect(declined.decidedAt).not.toBeNull()

		const restored = await writer.call<Offer>('restoreOffer', offer.id)
		expect(restored).toEqual({ ...offer, disposition: 'undecided', decidedAt: null })
	})

	it('restores only a Declined Offer', async () => {
		const writer = await openAgentSocket('offer-restore-guard')
		const offer = await createOffer('offer-restore-guard', reference)
		await writer.call('setOfferDisposition', offer.id, 'accepted')

		await expect(writer.call('restoreOffer', offer.id)).rejects.toThrow(
			/is accepted, and restoring undoes a Decline/,
		)
	})

	it('refuses to rule on or restore an Offer that does not exist', async () => {
		const writer = await openAgentSocket('offer-unknown-id')

		await expect(writer.call('setOfferDisposition', 'nope', 'declined')).rejects.toThrow(
			/No Offer carries the id nope/,
		)
		await expect(writer.call('restoreOffer', 'nope')).rejects.toThrow(
			/No Offer carries the id nope/,
		)
	})

	// A research turn records its Offers in one invocation, where the Worker's
	// clock barely advances — so `created_at` cannot order them and `seq` does.
	it('lists a batch recorded in one turn in the order it was recorded', async () => {
		await openAgentSocket('offer-batch')
		const titles = ['first', 'second', 'third', 'fourth']

		const recorded = await recordOffers(
			'offer-batch',
			titles.map((title) => ({ type: 'link', source: { title } })),
		)

		expect(recorded.map((entry) => entry.offer.source?.title)).toEqual(titles)
		await expect(
			listOffers('offer-batch').then((offers) =>
				offers.map((offer) => offer.source?.title),
			),
		).resolves.toEqual(titles)
	})

	it('keeps its Offers through a hibernation cycle', async () => {
		const writer = await openAgentSocket('offer-hibernation')
		const kept = await createOffer('offer-hibernation', quote)
		const declined = await createOffer('offer-hibernation', reference)
		await writer.call('setOfferDisposition', declined.id, 'declined')

		// The socket hibernates rather than closing, so the next call wakes the
		// Article Agent with its in-memory state gone and onStart run again.
		await evictDurableObject(agentStub('offer-hibernation'))

		const offers = await listOffers('offer-hibernation')

		expect(offers.map((offer) => [offer.id, offer.disposition])).toEqual([
			[kept.id, 'undecided'],
			[declined.id, 'declined'],
		])
	})

	it('records a research turn as a batch, in the order the model gave it', async () => {
		await openAgentSocket('offer-batch-record')

		const recorded = await recordOffers('offer-batch-record', [quote, reference])

		expect(recorded.map((entry) => entry.duplicate)).toEqual([false, false])
		await expect(listOffers('offer-batch-record')).resolves.toEqual(
			recorded.map((entry) => entry.offer),
		)
	})

	it('refuses a whole research turn when one entry does not parse', async () => {
		await openAgentSocket('offer-batch-refused')

		await expect(
			recordOffers('offer-batch-refused', [quote, { type: 'quote' }]),
		).rejects.toThrow(/of type quote carries a text/)
		await expect(listOffers('offer-batch-refused')).resolves.toEqual([])
	})

	it('recognises a source turned up again as the Offer it already carries', async () => {
		const writer = await openAgentSocket('offer-reoffered')
		const [first] = await recordOffers('offer-reoffered', [reference])
		await writer.call('setOfferDisposition', first.offer.id, 'accepted')

		// The same source next session, worded differently.
		const [again] = await recordOffers('offer-reoffered', [
			{ ...reference, note: 'Turned up again, and still the best figure.' },
		])

		expect(again.duplicate).toBe(true)
		expect(again.offer.id).toBe(first.offer.id)
		expect(again.offer.disposition).toBe('accepted')
		await expect(listOffers('offer-reoffered')).resolves.toHaveLength(1)
	})

	// Two tool calls in one step run concurrently, and `commit` yields — so both
	// turns read before the other's rows landed. The unique index on the
	// fingerprint is what stops the second one writing a twin.
	it('records one Offer when two concurrent turns offer the same source', async () => {
		await openAgentSocket('offer-concurrent')

		const [first, second] = await inAgent('offer-concurrent', (agent) =>
			Promise.all([agent.recordOffers([reference]), agent.recordOffers([reference])]),
		)

		expect(first[0].duplicate).toBe(false)
		expect(second[0].duplicate).toBe(true)
		expect(second[0].offer.id).toBe(first[0].offer.id)
		await expect(listOffers('offer-concurrent')).resolves.toHaveLength(1)
	})

	// party-db commits a call in one transaction, so the rejected row takes the
	// turn's other rows down with it. The losing turn has to come back with the
	// source it alone found.
	it('records the rest of a losing turn when one of its entries is taken', async () => {
		await openAgentSocket('offer-concurrent-batch')

		const [first, second] = await inAgent('offer-concurrent-batch', (agent) =>
			Promise.all([
				agent.recordOffers([reference]),
				agent.recordOffers([reference, quote]),
			]),
		)

		expect(first.map((entry) => entry.duplicate)).toEqual([false])
		expect(second.map((entry) => entry.duplicate)).toEqual([true, false])
		expect(second[0].offer.id).toBe(first[0].offer.id)
		await expect(
			listOffers('offer-concurrent-batch').then((offers) => offers.map((one) => one.id)),
		).resolves.toEqual([first[0].offer.id, second[1].offer.id])
	})

	// The fingerprint column arrived after the table did, so a deployed Article
	// wakes with the old shape and its Offers have to come through the rebuild.
	// `onStart` runs on every wake, so the migration has to be idempotent: a
	// throw there is caught by the SDK, and the Agent carries on with the rest
	// of `onStart` — the party-db core included — never built.
	it("carries an Article's Offers across the fingerprint column", async () => {
		const writer = await openAgentSocket('offer-migration')
		const kept = await createOffer('offer-migration', quote)
		const declined = await createOffer('offer-migration', reference)
		await writer.call('setOfferDisposition', declined.id, 'declined')

		await toOldOfferTable('offer-migration')

		// Two wakes over the same table: the first migrates it, the second meets
		// a table it has nothing to do to. Each socket is what runs `onStart`,
		// the way a writer opening the Article does.
		await evictDurableObject(agentStub('offer-migration'))
		await openAgentSocket('offer-migration')
		await evictDurableObject(agentStub('offer-migration'))
		await openAgentSocket('offer-migration')

		// Same ids, same order, same rulings.
		await expect(
			listOffers('offer-migration').then((offers) =>
				offers.map((one) => [one.id, one.disposition]),
			),
		).resolves.toEqual([
			[kept.id, 'undecided'],
			[declined.id, 'declined'],
		])

		// And the migrated rows carry the fingerprint, so the dedupe finds them.
		const recorded = await recordOffers('offer-migration', [quote, reference])

		expect(recorded.map((entry) => entry.duplicate)).toEqual([true, true])
		expect(recorded.map((entry) => entry.offer.id)).toEqual([kept.id, declined.id])
	})

	// An Article written before the index could hold two rows for one source.
	// The index cannot build over the pair, so the migration keeps the row the
	// writer saw first and drops its twin — and carries on, which is why the
	// Offer after the twin is what this asserts on.
	it('keeps the older row when an Article carries a double-record', async () => {
		await openAgentSocket('offer-migration-twin')
		const first = await createOffer('offer-migration-twin', reference)

		// Written the way the race wrote it: two rows, one source, and a third
		// Offer behind them that the migration must still reach.
		await toOldOfferTable('offer-migration-twin')
		await inAgent('offer-migration-twin', (agent) => {
			agent.sql`
				INSERT INTO offer (id, type, disposition, text, source, note, created_at, decided_at)
				SELECT 'twin', type, disposition, text, source, note, created_at, decided_at
				FROM offer WHERE id = ${first.id}
			`
			agent.sql`
				INSERT INTO offer (id, type, disposition, text, source, note, created_at, decided_at)
				VALUES ('behind', 'link', 'undecided', NULL, ${JSON.stringify({ title: 'Behind the twin' })}, NULL, ${Date.now()}, NULL)
			`
		})

		await evictDurableObject(agentStub('offer-migration-twin'))
		await openAgentSocket('offer-migration-twin')

		await expect(
			listOffers('offer-migration-twin').then((offers) => offers.map((one) => one.id)),
		).resolves.toEqual([first.id, 'behind'])

		const [again] = await recordOffers('offer-migration-twin', [reference])

		expect(again.duplicate).toBe(true)
		expect(again.offer.id).toBe(first.id)
	})

	it('records one turn offering the same source twice as one Offer', async () => {
		await openAgentSocket('offer-batch-duplicate')

		const recorded = await recordOffers('offer-batch-duplicate', [reference, reference])

		expect(recorded.map((entry) => entry.duplicate)).toEqual([false, true])
		expect(recorded[1].offer.id).toBe(recorded[0].offer.id)
	})

	it('leaves the Plan alone when a disposition changes', async () => {
		const writer = await openAgentSocket('offer-and-plan')
		await writer.next('cf_agent_state')
		writer.setState(plan)
		const offer = await createOffer('offer-and-plan', quote)

		await writer.call('setOfferDisposition', offer.id, 'accepted')

		await expect(writer.quiet('cf_agent_state')).resolves.toEqual([])

		const returning = await openAgentSocket('offer-and-plan')
		await expect(returning.next('cf_agent_state')).resolves.toMatchObject({ state: plan })
	})
})

/** Accepting end to end: two writes, and neither store hears about the other. */
describe('Accepting an Offer into the Plan', () => {
	/** The Plan as it stands after `setState`, read from a fresh connection. */
	async function readPlan(name: string): Promise<Plan> {
		const returning = await openAgentSocket(name)
		const frame = await returning.next('cf_agent_state')

		return frame.state as Plan
	}

	/** What `acceptOffer` builds in the app, sent whole here. */
	function copiedInto(held: Plan, offer: Offer): Plan {
		return { ...held, references: [...held.references, referenceFromOffer(offer, 'r1')] }
	}

	const opening = makePlan({
		title: 'The permit queue',
		outline: [makeNode({ id: 'n1', title: 'The opening' })],
	})

	it('copies the Offer in, and lets the writer edit the copy without touching the row', async () => {
		const writer = await openAgentSocket('accept-and-edit')
		await writer.next('cf_agent_state')
		writer.setState(opening)
		const [{ offer }] = await recordOffers('accept-and-edit', [quote])

		// The copy first, built from what the Offer says; then the ruling.
		writer.setState(copiedInto(opening, offer))
		const ruled = await writer.call<Offer>('setOfferDisposition', offer.id, 'accepted')

		const accepted = await readPlan('accept-and-edit')
		expect(accepted.references).toEqual([
			{
				id: 'r1',
				type: 'quote',
				provenance: { type: 'offer', offerId: offer.id },
				nodeId: null,
				text: quote.text,
				source: quote.source,
			},
		])

		// The writer edits their copy: a shorter pull, placed at a Section.
		writer.setState({
			...accepted,
			references: [
				{ ...accepted.references[0], text: 'We did not decide.', nodeId: 'n1' },
			],
		})

		const edited = await readPlan('accept-and-edit')
		expect(edited.references[0]).toMatchObject({
			text: 'We did not decide.',
			nodeId: 'n1',
		})
		await expect(listOffers('accept-and-edit')).resolves.toEqual([ruled])
	})

	it('Declines and restores without the Plan hearing about it', async () => {
		const writer = await openAgentSocket('decline-and-restore')
		await writer.next('cf_agent_state')
		writer.setState(opening)
		const [{ offer }] = await recordOffers('decline-and-restore', [reference])

		await writer.call('setOfferDisposition', offer.id, 'declined')
		const restored = await writer.call<Offer>('restoreOffer', offer.id)

		expect(restored.disposition).toBe('undecided')
		await expect(readPlan('decline-and-restore')).resolves.toEqual(opening)
	})

	// The copy goes first, so the write left to fail is the ruling. What that
	// leaves is a copy in the Plan and a row still Undecided — the writer sees an
	// unticked row and Accepts again, and nothing is stranded anywhere.
	it('keeps the copy when the ruling does not land, and copies once on the retry', async () => {
		const writer = await openAgentSocket('accept-no-ruling')
		await writer.next('cf_agent_state')
		writer.setState(opening)
		const [{ offer }] = await recordOffers('accept-no-ruling', [reference])

		writer.setState(copiedInto(opening, offer))
		// The tab closes here, and the ruling is never sent.

		const held = await readPlan('accept-no-ruling')
		expect(held.references.map((copy) => copy.provenance.offerId)).toEqual([offer.id])
		await expect(listOffers('accept-no-ruling')).resolves.toEqual([offer])

		// Accepting again sends the ruling. `acceptOffer` finds the copy on the
		// Provenance and builds no op, so the Plan is not written a second time.
		const ruled = await writer.call<Offer>('setOfferDisposition', offer.id, 'accepted')
		expect(ruled.disposition).toBe('accepted')
		expect(referenceForOffer(held, offer.id)?.id).toBe('r1')
		await expect(readPlan('accept-no-ruling')).resolves.toEqual(held)
	})
})
