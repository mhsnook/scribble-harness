import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import type { RecordedOffer } from '../../src/server/article-agent'
import { referenceForOffer, referenceFromOffer } from '../../src/shared/ledger'
import type { Offer } from '../../src/shared/offer'
import type { Plan, ReferenceContent } from '../../src/shared/plan'
import { emptyPlan, isPlanRefused } from '../../src/shared/plan'
import { makeNode, makePlan, makeReference } from '../shared/plan-fixtures'
import { openAgentSocket } from './agent-socket'

/** Record an Offer the way the Chat will: inside the Agent, not over RPC.
 * `createOffer` is deliberately not `@callable`, so a test reaches it the same
 * way the research tool does. The Article Agent must already be awake, which
 * every caller here arranges by opening a socket first. */
function createOffer(name: string, content: ReferenceContent): Promise<Offer> {
	const stub = env.ArticleAgent.get(env.ArticleAgent.idFromName(name))

	return runInDurableObject(stub, (agent) => agent.createOffer(content))
}

/** One research turn, the way the tool will run it. */
function recordOffers(name: string, batch: unknown): Promise<RecordedOffer[]> {
	const stub = env.ArticleAgent.get(env.ArticleAgent.idFromName(name))

	return runInDurableObject(stub, (agent) => agent.recordOffers(batch))
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
	// Durable Object, so the set is worth naming — `createOffer` is absent
	// because only the Chat records an Offer. It also proves the decorator
	// survived the build: oxc does not lower one, and `agents/vite` does.
	it('marks every writer-facing method callable, and nothing else', async () => {
		const stub = env.ArticleAgent.get(env.ArticleAgent.idFromName('callable-set'))

		const methods = await runInDurableObject(stub, (agent) => [
			...agent.getCallableMethods().keys(),
		])

		// Exact, so reaching the browser is a decision rather than a side effect
		// of adding a method: `recordOffers` and `createOffer` stay off it,
		// because the Guide writes those and the writer never authors one.
		// `listNotes` and `listRounds` are off it too — a client reads Notes and
		// Rounds from its synced collections (§12), not over RPC.
		expect(methods.sort()).toEqual([
			'listBlocks',
			'listOffers',
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
		const writer = await openAgentSocket('offer-create')

		const offer = await createOffer('offer-create', quote)

		expect(offer).toMatchObject({
			type: 'quote',
			disposition: 'undecided',
			decidedAt: null,
		})
		await expect(writer.call<Offer[]>('listOffers')).resolves.toEqual([offer])
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
		const stub = env.ArticleAgent.get(env.ArticleAgent.idFromName('offer-batch'))

		const titles = await runInDurableObject(stub, (agent) => {
			const recorded = ['first', 'second', 'third', 'fourth'].map((title) =>
				agent.createOffer({ type: 'link', source: { title } }),
			)

			return {
				recorded: recorded.map((offer) => offer.source?.title),
				listed: agent.listOffers().map((offer) => offer.source?.title),
			}
		})

		expect(titles.listed).toEqual(titles.recorded)
	})

	it('keeps its Offers through a hibernation cycle', async () => {
		const writer = await openAgentSocket('offer-hibernation')
		const kept = await createOffer('offer-hibernation', quote)
		const declined = await createOffer('offer-hibernation', reference)
		await writer.call('setOfferDisposition', declined.id, 'declined')

		// The socket hibernates rather than closing, so the next call wakes the
		// Article Agent with its in-memory state gone and onStart run again.
		await evictDurableObject(
			env.ArticleAgent.get(env.ArticleAgent.idFromName('offer-hibernation')),
		)

		const offers = await writer.call<Offer[]>('listOffers')

		expect(offers.map((offer) => [offer.id, offer.disposition])).toEqual([
			[kept.id, 'undecided'],
			[declined.id, 'declined'],
		])
	})

	it('records a research turn as a batch, in the order the model gave it', async () => {
		const writer = await openAgentSocket('offer-batch-record')

		const recorded = await recordOffers('offer-batch-record', [quote, reference])

		expect(recorded.map((entry) => entry.duplicate)).toEqual([false, false])
		await expect(writer.call<Offer[]>('listOffers')).resolves.toEqual(
			recorded.map((entry) => entry.offer),
		)
	})

	it('refuses a whole research turn when one entry does not parse', async () => {
		await openAgentSocket('offer-batch-refused')

		await expect(
			recordOffers('offer-batch-refused', [quote, { type: 'quote' }]),
		).rejects.toThrow(/of type quote carries a text/)
		await expect(
			runInDurableObject(
				env.ArticleAgent.get(env.ArticleAgent.idFromName('offer-batch-refused')),
				(agent) => agent.listOffers(),
			),
		).resolves.toEqual([])
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
		await expect(writer.call<Offer[]>('listOffers')).resolves.toHaveLength(1)
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
		await expect(writer.call<Offer[]>('listOffers')).resolves.toEqual([ruled])
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
		await expect(writer.call<Offer[]>('listOffers')).resolves.toEqual([offer])

		// Accepting again sends the ruling. `acceptOffer` finds the copy on the
		// Provenance and builds no op, so the Plan is not written a second time.
		const ruled = await writer.call<Offer>('setOfferDisposition', offer.id, 'accepted')
		expect(ruled.disposition).toBe('accepted')
		expect(referenceForOffer(held, offer.id)?.id).toBe('r1')
		await expect(readPlan('accept-no-ruling')).resolves.toEqual(held)
	})
})
