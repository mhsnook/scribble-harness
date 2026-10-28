import { describe, expect, it, vi } from 'vitest'

import { decisionModel, type Question } from '../../src/server/llm/decide'

/**
 * The decision-model boundary — `docs/llm.md`. No test reaches Clef: the
 * binding is stubbed, and what is under test is the request sent and the
 * answer read.
 */

type Run = (model: string, inputs: unknown, options: unknown) => Promise<unknown>

/** An `Env` carrying only what `decisionModel` reads. */
function withBinding(answer: unknown, gateway?: string) {
	const run = vi.fn<Run>(async () => answer)
	const env = { AI: { run }, ...(gateway !== undefined && { AI_GATEWAY_ID: gateway }) }

	return { run, decide: decisionModel(env as unknown as Env) }
}

const questions: Record<string, Question> = {
	merit: { type: 'score', instructions: 'How useful?', criteria: ['no', 'yes'] },
}

describe('the decision boundary', () => {
	it('sends the state and questions to Clef, naming the model twice', async () => {
		const { run, decide } = withBinding({ answers: {} })

		await decide({ result: 'r' }, questions)

		const [model, inputs] = run.mock.calls[0]!
		expect(model).toBe('@cf/cloudflare/clef')
		expect(inputs).toEqual({ model: 'clef', state: { result: 'r' }, questions })
	})

	it('logs through the Gateway where one is named', async () => {
		const { run, decide } = withBinding({ answers: {} }, 'scribble')

		await decide({}, questions)

		expect(run.mock.calls[0]![2]).toMatchObject({
			gateway: { id: 'scribble', skipCache: true },
		})
	})

	it('reads each type of answer, and ignores fields it does not use', async () => {
		const { decide } = withBinding({
			model: 'clef',
			answers: {
				merit: { type: 'score', score: 2.4, legend: { 0: 'no' }, confidence: 0.7 },
				yes: { type: 'noul', noul: 0.8 },
				which: { type: 'choice', choice: 'a', probabilities: { a: 0.6, b: 0.4 } },
			},
			usage: { input_tokens: 120, output_tokens: 0 },
		})

		expect(await decide({}, questions)).toEqual({
			merit: { type: 'score', score: 2.4 },
			yes: { type: 'noul', noul: 0.8 },
			which: { type: 'choice', choice: 'a', probabilities: { a: 0.6, b: 0.4 } },
		})
	})

	// The caller holds the fallback, so the boundary says what went wrong
	// rather than answering with something half-read.
	it('rejects an answer it cannot read', async () => {
		const { decide } = withBinding({ answers: { merit: { type: 'score' } } })

		await expect(decide({}, questions)).rejects.toThrow(/score/)
	})
})
