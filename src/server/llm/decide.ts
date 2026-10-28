import { z } from 'zod'

import { gatewayFor } from './model'

/**
 * The decision-model boundary — `docs/llm.md`. Clef answers typed questions
 * about one state with calibrated probabilities rather than text, and this is
 * the only place it is named, as `llm/model.ts` names the language model.
 */
const modelId = '@cf/cloudflare/clef'

/** Sent in the body as well as named in the id, because Clef refuses a
 * request that leaves it out. */
const modelName = 'clef'

const timeoutMs = 10_000

/** One question, in Clef's own request shape. A `choice` maps each option's
 * name to what it means; a `score` lists its levels lowest first. */
export type Question =
	| { type: 'noul'; instructions: string }
	| { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
	| { type: 'score'; instructions: string; criteria: string[] }

/** Loose rather than strict, like the search provider's results: a field Clef
 * adds should not fail an answer that otherwise parsed. */
const answerSchema = z.discriminatedUnion('type', [
	/** The probability of yes. */
	z.object({ type: z.literal('noul'), noul: z.number() }),
	z.object({
		type: z.literal('choice'),
		choice: z.string(),
		probabilities: z.record(z.string(), z.number()).optional(),
		confidence: z.number().optional(),
	}),
	/** Probability-weighted, so it can fall between two levels. */
	z.object({ type: z.literal('score'), score: z.number() }),
])
export type Answer = z.infer<typeof answerSchema>

const decisionSchema = z.object({ answers: z.record(z.string(), answerSchema) })

/** Rejects on a failed call or an answer that does not parse, unlike the
 * search, because the caller is what knows the fallback. */
export type Decide = (
	state: unknown,
	questions: Record<string, Question>,
	abortSignal?: AbortSignal,
) => Promise<Record<string, Answer>>

export function decisionModel(env: Env): Decide {
	return async (state, questions, abortSignal) => {
		const signals = [AbortSignal.timeout(timeoutMs)]
		if (abortSignal !== undefined) signals.push(abortSignal)

		const answered = await env.AI.run(
			modelId,
			{ model: modelName, state, questions },
			{ gateway: gatewayFor(env), signal: AbortSignal.any(signals) },
		)

		return decisionSchema.parse(answered).answers
	}
}
