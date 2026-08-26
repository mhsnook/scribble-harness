import { definePartyCollection } from 'party-db'
import { z } from 'zod'

import { type Note, type NoteAnchor, noteDispositions } from './note'
import { reviewDepths, type Round, type RoundPassage, roundStates } from './review'

/**
 * The two party-db collections the Notes Panel syncs — docs/architecture.md §12.
 *
 * A collection's rows ARE the Article Agent's table rows, so the schemas here
 * spell the columns as the tables do: snake_case names, JSON columns as the
 * text they store. `toNote` and `toRound` turn one row into the shape the app
 * reads, and they are the only place that mapping lives.
 *
 * The JSON columns (`anchor`, `passages`) are declared `z.string()` on
 * purpose: party-db's column codec reads Zod v3 internals to spot a JSON
 * column, and this repo is on Zod v4, so an object-typed field would come back
 * from a snapshot as unparsed text anyway (party-db#45). Declaring the text is
 * the honest shape either way, and the converters parse it once.
 */

/** One `note` row as it travels. `seq` is assigned by the table, so a write
 * omits it and every synced row carries it. */
export const noteRowSchema = z.object({
	seq: z.number().optional(),
	id: z.string(),
	round_id: z.string(),
	type: z.string(),
	/** JSON text of a `NoteAnchor`. */
	anchor: z.string(),
	label: z.string().nullable(),
	body: z.string(),
	disposition: z.enum(noteDispositions),
	created_at: z.number(),
	decided_at: z.number().nullable(),
})
export type NoteRow = z.infer<typeof noteRowSchema>

/** One `round` row as it travels. */
export const roundRowSchema = z.object({
	seq: z.number().optional(),
	id: z.string(),
	state: z.enum(roundStates),
	prompt: z.string(),
	depth: z.enum(reviewDepths),
	/** JSON text of `RoundPassage[]`. */
	passages: z.string(),
	failure: z.string().nullable(),
	started_at: z.number(),
	finished_at: z.number().nullable(),
})
export type RoundRow = z.infer<typeof roundRowSchema>

/** name === channel === table name, on both sides of the wire. */
export const noteCollection = definePartyCollection({
	name: 'note',
	key: 'id',
	schema: noteRowSchema,
})

export const roundCollection = definePartyCollection({
	name: 'round',
	key: 'id',
	schema: roundRowSchema,
})

export const syncCollections = [noteCollection, roundCollection]

/** The inverse of `toNote`, so a fixture or a mock states the columns through
 * this module rather than keeping its own copy of the wire shape. */
export function fromNote(note: Note, seq: number): NoteRow {
	return {
		seq,
		id: note.id,
		round_id: note.roundId,
		type: note.type,
		anchor: JSON.stringify(note.anchor),
		label: note.label ?? null,
		body: note.body,
		disposition: note.disposition,
		created_at: note.createdAt,
		decided_at: note.decidedAt,
	}
}

/** The inverse of `toRound`. */
export function fromRound(round: Round): RoundRow {
	return {
		seq: round.ordinal,
		id: round.id,
		state: round.state,
		prompt: round.prompt,
		depth: round.depth,
		passages: JSON.stringify(round.passages),
		failure: round.failure,
		started_at: round.startedAt,
		finished_at: round.finishedAt,
	}
}

export function toNote(row: NoteRow): Note {
	return {
		id: row.id,
		roundId: row.round_id,
		type: row.type,
		anchor: JSON.parse(row.anchor) as NoteAnchor,
		...(row.label === null ? {} : { label: row.label }),
		body: row.body,
		disposition: row.disposition,
		createdAt: row.created_at,
		decidedAt: row.decided_at,
	}
}

export function toRound(row: RoundRow): Round {
	return {
		id: row.id,
		ordinal: row.seq ?? 0,
		state: row.state,
		prompt: row.prompt,
		depth: row.depth,
		passages: JSON.parse(row.passages) as RoundPassage[],
		failure: row.failure,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
	}
}
