import {
	generateObject,
	type LanguageModel,
	type ModelMessage,
	NoObjectGeneratedError,
} from 'ai'

import { reasonFor } from '../../shared/failure'
import {
	type ReviewDepth,
	type ReviewOutput,
	reviewOutputSchema,
} from '../../shared/review'
import { reviewPackMessages, type ReviewPack, reviewSystemPrompt } from './review-pack'

/**
 * One Review, composed away from the Durable Object that hosts it. Pure over
 * what it is handed, so a test drives it with a scripted model and no Article
 * Agent — the same shape as `llm/chat-turn.ts`.
 *
 * The answer is **prose inside a structure**: the model writes the passages the
 * writer reads, and the schema is what carries each one's Notes and their
 * anchors. Nothing here parses prose to find them. One retry carries the
 * validation error back — `docs/llm.md`.
 */

export type ReviewTurn = {
	model: LanguageModel
	depth: ReviewDepth
	pack: ReviewPack
	abortSignal?: AbortSignal
}

export async function reviewTurn({
	model,
	depth,
	pack,
	abortSignal,
}: ReviewTurn): Promise<ReviewOutput> {
	const system = reviewSystemPrompt(depth)
	const messages = reviewPackMessages(pack)

	const ask = (asked: ModelMessage[]) =>
		generateObject({
			model,
			system,
			messages: asked,
			schema: reviewOutputSchema,
			abortSignal,
		})

	try {
		const { object } = await ask(messages)

		return object
	} catch (error) {
		// One retry, and only for an answer in the wrong shape: a model that gets
		// the shape wrong the same way twice will get it wrong a third time, and
		// the writer is waiting. Anything else — an outage, a timeout — has had
		// `generateObject`'s own transport retries already, and a correction
		// message would tell the model it refused an answer it was not the source
		// of. The rethrow is what the Round records as its reason.
		if (abortSignal?.aborted === true) throw error
		if (!NoObjectGeneratedError.isInstance(error)) throw error

		const { object } = await ask([...messages, correction(error)])

		return object
	}
}

/** What the model is told about its own refused answer. `generateObject` throws
 * on both a schema mismatch and unparseable JSON, and the message names which. */
function correction(error: unknown): ModelMessage {
	return {
		role: 'user',
		content: [
			`That response was refused: ${reasonFor(error)}`,
			'Answer again in the shape asked for, correcting only what the error names.',
		].join('\n'),
	}
}
