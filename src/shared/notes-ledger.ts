import type { Note, NoteDisposition } from './note'
import type { Round } from './review'

/**
 * The Notes ledger — every Note on the Article, gathered under the Round that
 * wrote it. The sibling of `offerLedger` in `ledger.ts`, and the same idea: a
 * query over rows, derived on read, holding no copy of its own.
 *
 * The Notes Panel shows one Round at a time, the way the Chat shows one
 * transcript. This is the other view — the whole record, newest first — and it
 * opens over that one.
 */

/** One Round's Notes, split by how far along each is. Four lists rather than
 * one, because the Panel draws each at a different size: what the writer has
 * not ruled on is worth a card, and what they have settled is worth a line. */
export type LedgerRound = {
	round: Round
	proposed: Note[]
	accepted: Note[]
	declined: Note[]
	resolved: Note[]
}

export type NotesLedger = {
	/** Newest Round first. A Round that wrote no Notes is left out: the Panel's
	 * other view is where an empty Round explains itself. */
	rounds: LedgerRound[]
	counts: Record<'all' | NoteDisposition, number>
}

export function notesLedger(
	notes: readonly Note[],
	rounds: readonly Round[],
): NotesLedger {
	const counts: Record<'all' | NoteDisposition, number> = {
		all: notes.length,
		proposed: 0,
		accepted: 0,
		declined: 0,
		resolved: 0,
	}
	for (const note of notes) counts[note.disposition] += 1

	const byRound = new Map<string, LedgerRound>()
	for (const round of rounds) {
		byRound.set(round.id, {
			round,
			proposed: [],
			accepted: [],
			declined: [],
			resolved: [],
		})
	}

	// A Note whose Round is not in the list is dropped rather than floated: the
	// two collections sync separately, so one can arrive a beat before the other.
	for (const note of notes) byRound.get(note.roundId)?.[note.disposition].push(note)

	const written = [...byRound.values()].filter((one) => size(one) > 0)

	return { rounds: written.reverse(), counts }
}

function size(one: LedgerRound): number {
	return (
		one.proposed.length + one.accepted.length + one.declined.length + one.resolved.length
	)
}

/** What the writer still owes the piece: a Note to rule on, or one they agreed
 * to and have not resolved. Declining and resolving both leave this number. */
export function owed(counts: NotesLedger['counts']): number {
	return counts.proposed + counts.accepted
}

export const DISPOSITIONS = [
	'proposed',
	'accepted',
	'declined',
	'resolved',
] as const satisfies readonly NoteDisposition[]

/** What the ledger is showing. A null `roundId` means every Round, but an empty
 * `dispositions` means no Notes at all — `EVERYTHING` is the unfiltered one. */
export type LedgerFilter = {
	dispositions: ReadonlySet<NoteDisposition>
	roundId: string | null
}

export const EVERYTHING: LedgerFilter = {
	dispositions: new Set(DISPOSITIONS),
	roundId: null,
}

/**
 * The Rounds and Notes the filter keeps. A Round the filter empties is dropped
 * rather than left as a heading over nothing.
 */
export function filterRounds(
	rounds: readonly LedgerRound[],
	filter: LedgerFilter,
): LedgerRound[] {
	const kept = (one: LedgerRound, disposition: NoteDisposition) =>
		filter.dispositions.has(disposition) ? one[disposition] : []

	return rounds
		.filter((one) => filter.roundId === null || one.round.id === filter.roundId)
		.map((one) => ({
			round: one.round,
			proposed: kept(one, 'proposed'),
			accepted: kept(one, 'accepted'),
			declined: kept(one, 'declined'),
			resolved: kept(one, 'resolved'),
		}))
		.filter((one) => size(one) > 0)
}

export function countRounds(rounds: readonly LedgerRound[]): number {
	return rounds.reduce((sum, one) => sum + size(one), 0)
}
