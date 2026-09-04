import { z } from 'zod'

import { noteContentSchema } from './note'
import { planSchema } from './plan'

/** A Review and the Round it produces — `docs/reviews.md` for what they are,
 * `docs/sync.md` for who writes them. */

/** How hard one Review works — `docs/reviews.md`. */
export const reviewDepths = ['quick', 'thorough'] as const
export type ReviewDepth = (typeof reviewDepths)[number]

/**
 * What the writer asks for. The Plan rides here for the same reason it rides in
 * a Chat turn's `body` (`docs/chat.md`): the client may hold a newer one than the Article
 * Agent has stored. Absent is ordinary, and state is then the only Plan there
 * is.
 */
export const reviewRequestSchema = z.strictObject({
	prompt: z.string().min(1),
	depth: z.enum(reviewDepths),
	plan: planSchema.optional(),
})
export type ReviewRequest = z.infer<typeof reviewRequestSchema>

/**
 * One passage of the response: the Guide's prose, and the Notes it produced.
 *
 * Flat rather than a union of "some prose" and "some notes", because a model
 * fills one object shape more reliably than it alternates between two. An empty
 * `notes` is ordinary.
 */
export const reviewPassageSchema = z.strictObject({
	prose: z.string().min(1),
	label: z.string().min(1).optional(),
	notes: z.array(noteContentSchema),
})

/** What the model answers with, whole. */
export const reviewOutputSchema = z.strictObject({
	passages: z.array(reviewPassageSchema).min(1),
})
export type ReviewOutput = z.infer<typeof reviewOutputSchema>

/** A passage as stored: its Notes are ids, so the response and the queue read
 * the same rows. */
export type RoundPassage = {
	prose: string
	label?: string
	noteIds: string[]
}

export const roundStates = ['running', 'done', 'failed'] as const
export type RoundState = (typeof roundStates)[number]

/** One numbered Review of an Article. */
export type Round = {
	id: string
	/** What the writer reads: "Round 3". Counts failed Rounds too, because a
	 * Round they watched fail is one they saw. */
	ordinal: number
	state: RoundState
	prompt: string
	depth: ReviewDepth
	/** Empty while the Review runs, and empty on one that failed. */
	passages: RoundPassage[]
	failure: string | null
	startedAt: number
	finishedAt: number | null
}

/** One Review at a time per Article — `docs/reviews.md` for why the guard is the row. */
export function reviewAlreadyRunning(round: Round): Error {
	return new Error(`Round ${round.ordinal} is still running on this Article.`)
}
