import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { readHouse } from '../../src/server/house'
import {
	fromHouseTone,
	fromLexiconEntry,
	fromRule,
	HOUSE_ROOM,
	type LexiconEntry,
	writerProvenance,
} from '../../src/shared/house'
import { openSyncSocket, postWrite } from './sync-socket'

/**
 * The House room — `docs/house.md`. One party-db room over D1, and the one
 * room in this app the writer's browser writes to directly.
 */

const HOUSE_PARTY = 'house'

/** One row the way `partyTransport.send` sends it. */
function insert(channel: string, value: unknown) {
	return [{ channel, ops: [{ type: 'insert', value }] }]
}

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

describe('the House room', () => {
	it('takes a client write, where an Article refuses one', async () => {
		const written = await postWrite(
			HOUSE_ROOM,
			insert(
				'lexicon',
				fromLexiconEntry(entry('the Beat', 'A subject I cover over time.')),
			),
			HOUSE_PARTY,
		)

		expect(written.status).toBe(200)
	})

	it('sends a written row to a connected subscriber', async () => {
		const reader = await openSyncSocket(HOUSE_ROOM, undefined, HOUSE_PARTY)

		await postWrite(
			HOUSE_ROOM,
			insert(
				'rule',
				fromRule({
					id: 'r1',
					ord: 1,
					body: 'No rhetorical questions.',
					createdAt: 1,
					updatedAt: 1,
				}),
			),
			HOUSE_PARTY,
		)

		// The connect answers with a snapshot batch per channel first, and an
		// empty room's is empty — so the written row is the batch after it.
		await reader.next('rule')
		const batch = await reader.next('rule')

		expect(batch.ops[0].value).toMatchObject({ body: 'No rhetorical questions.' })
	})

	it('persists to D1 rather than to its own storage', async () => {
		await postWrite(
			HOUSE_ROOM,
			insert('tone', fromHouseTone({ voice: 'reported feature', adjectives: ['warm'] })),
			HOUSE_PARTY,
		)

		const row = await env.DB.prepare('SELECT voice FROM tone').first<{ voice: string }>()
		expect(row?.voice).toBe('reported feature')
	})

	it('hands a fresh subscriber the rows already written', async () => {
		await postWrite(
			HOUSE_ROOM,
			insert('skill', {
				id: 's1',
				name: 'Cuts',
				prompt: 'Where can this lose a line?',
				created_at: 1,
				updated_at: 1,
			}),
			HOUSE_PARTY,
		)

		const reader = await openSyncSocket(HOUSE_ROOM, undefined, HOUSE_PARTY)
		const batch = await reader.next('skill')

		expect(batch.ops.map((op) => (op.value as { name: string }).name)).toContain('Cuts')
	})
})

describe('readHouse', () => {
	it('reads what the room wrote, in the order a prompt reads it', async () => {
		await postWrite(
			HOUSE_ROOM,
			[
				{
					channel: 'lexicon',
					ops: [
						{
							type: 'insert',
							value: fromLexiconEntry(entry('Zeugma', 'One verb, two objects.')),
						},
						{
							type: 'insert',
							value: fromLexiconEntry(entry('Anaphora', 'The same opening, repeated.')),
						},
					],
				},
				{
					channel: 'rule',
					ops: [
						{
							type: 'insert',
							value: fromRule({
								id: 'r-second',
								ord: 2,
								body: 'Second.',
								createdAt: 1,
								updatedAt: 1,
							}),
						},
						{
							type: 'insert',
							value: fromRule({
								id: 'r-first',
								ord: 1,
								body: 'First.',
								createdAt: 1,
								updatedAt: 1,
							}),
						},
					],
				},
			],
			HOUSE_PARTY,
		)

		const house = await readHouse(env.DB)

		expect(house.lexicon.map((held) => held.term)).toEqual(
			expect.arrayContaining(['Anaphora', 'Zeugma']),
		)
		expect(house.rules.map((held) => held.body)).toEqual(
			expect.arrayContaining(['First.', 'Second.']),
		)
		// Alphabetical for the Lexicon, the writer's order for the rules.
		expect(house.lexicon.findIndex((held) => held.term === 'Anaphora')).toBeLessThan(
			house.lexicon.findIndex((held) => held.term === 'Zeugma'),
		)
		expect(house.rules.findIndex((held) => held.body === 'First.')).toBeLessThan(
			house.rules.findIndex((held) => held.body === 'Second.'),
		)
	})

	it('reads an empty House as one that states nothing', async () => {
		await env.DB.prepare('DELETE FROM tone').run()

		const house = await readHouse(env.DB)

		expect(house.tone).toEqual({})
	})
})
