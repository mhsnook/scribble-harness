import { describe, expect, it } from 'vitest'

import type { Note, NoteDisposition } from '../../src/shared/note'
import { notesLedger, owed } from '../../src/shared/notes-ledger'
import type { Round } from '../../src/shared/review'

function round(id: string, ordinal: number): Round {
	return {
		id,
		ordinal,
		state: 'done',
		prompt: 'Look for repetition.',
		depth: 'quick',
		passages: [],
		failure: null,
		startedAt: ordinal,
		finishedAt: ordinal,
	}
}

function note(id: string, roundId: string, disposition: NoteDisposition): Note {
	return {
		id,
		roundId,
		type: 'repetition',
		anchor: { kind: 'article' },
		body: `Note ${id}.`,
		disposition,
		createdAt: 0,
		decidedAt: null,
	}
}

const rounds = [round('r1', 1), round('r2', 2)]

const notes = [
	note('a', 'r1', 'accepted'),
	note('b', 'r1', 'declined'),
	note('c', 'r1', 'resolved'),
	note('d', 'r2', 'proposed'),
	note('e', 'r2', 'accepted'),
]

describe('the Notes ledger', () => {
	it('puts the newest Round at the top', () => {
		expect(notesLedger(notes, rounds).rounds.map((one) => one.round.id)).toEqual([
			'r2',
			'r1',
		])
	})

	it('splits a Round by how far along each Note is', () => {
		const first = notesLedger(notes, rounds).rounds[1]

		expect(first.accepted.map((one) => one.id)).toEqual(['a'])
		expect(first.declined.map((one) => one.id)).toEqual(['b'])
		expect(first.resolved.map((one) => one.id)).toEqual(['c'])
		expect(first.proposed).toEqual([])
	})

	it('leaves out a Round that wrote no Notes', () => {
		const withEmpty = [...rounds, round('r3', 3)]

		expect(notesLedger(notes, withEmpty).rounds.map((one) => one.round.id)).toEqual([
			'r2',
			'r1',
		])
	})

	it('drops a Note whose Round has not arrived, since the two collections sync apart', () => {
		const early = [...notes, note('f', 'r9', 'proposed')]
		const ledger = notesLedger(early, rounds)

		expect(ledger.rounds.flatMap((one) => one.proposed).map((one) => one.id)).toEqual([
			'd',
		])
		// The count reads every Note, so the number does not flicker while the
		// Round catches up.
		expect(ledger.counts.proposed).toBe(2)
	})

	it('counts every disposition, and the whole', () => {
		expect(notesLedger(notes, rounds).counts).toEqual({
			all: 5,
			proposed: 1,
			accepted: 2,
			declined: 1,
			resolved: 1,
		})
	})

	it('owes what is unruled plus what is accepted and not resolved', () => {
		expect(owed(notesLedger(notes, rounds).counts)).toBe(3)
	})

	it('owes nothing once every Note is declined or resolved', () => {
		const settled = notes.map((one) => ({ ...one, disposition: 'resolved' as const }))

		expect(owed(notesLedger(settled, rounds).counts)).toBe(0)
	})
})
