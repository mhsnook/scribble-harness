import { definePartyCollection } from 'party-db'
import { z } from 'zod'

import { type Note, type NoteAnchor, noteDispositions } from './note'
import { dispositions, type Offer } from './offer'
import { referenceTypeSchema, type Source } from './plan/schema'
import { reviewDepths, type Round, type RoundPassage, roundStates } from './review'

/**
 * The `note`, `round` and `offer` party-db collections — docs/architecture.md
 * §12.
 *
 * The schemas spell the columns as the tables do: snake_case names, JSON
 * columns (`anchor`, `passages`, `source`) as the text they store. `z.string()`
 * for the JSON columns sidesteps party-db's Zod-v3-only column codec
 * (party-db#45); `toNote`, `toRound` and `toOffer` parse the text into the
 * shapes the app reads.
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

/** One `offer` row as it travels. An absent field is null on the wire and
 * `undefined` on an `Offer` — §4's one spelling per state, either side of a
 * column that has only the one way to say "nothing here". */
export const offerRowSchema = z.object({
	seq: z.number().optional(),
	id: z.string(),
	type: referenceTypeSchema,
	disposition: z.enum(dispositions),
	text: z.string().nullable(),
	/** JSON text of a `Source`. */
	source: z.string().nullable(),
	note: z.string().nullable(),
	created_at: z.number(),
	decided_at: z.number().nullable(),
})
export type OfferRow = z.infer<typeof offerRowSchema>

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

export const offerCollection = definePartyCollection({
	name: 'offer',
	key: 'id',
	schema: offerRowSchema,
})

export const syncCollections = [noteCollection, roundCollection, offerCollection]

/** The inverse of `toNote`, for code that builds rows — the Storybook mocks. */
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

/** The inverse of `toOffer`, for code that builds rows — the Article Agent's
 * insert, which leaves `seq` to the table, and the Storybook mocks, which
 * stand in for it. */
export function fromOffer(offer: Offer, seq?: number): OfferRow {
	return {
		...(seq === undefined ? {} : { seq }),
		id: offer.id,
		type: offer.type,
		disposition: offer.disposition,
		text: offer.text ?? null,
		source: offer.source === undefined ? null : JSON.stringify(offer.source),
		note: offer.note ?? null,
		created_at: offer.createdAt,
		decided_at: offer.decidedAt,
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

export function toOffer(row: OfferRow): Offer {
	return {
		id: row.id,
		type: row.type,
		disposition: row.disposition,
		text: row.text ?? undefined,
		source: row.source === null ? undefined : (JSON.parse(row.source) as Source),
		note: row.note ?? undefined,
		createdAt: row.created_at,
		decidedAt: row.decided_at,
	}
}
