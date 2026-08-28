import { MockLanguageModelV3 } from 'ai/test'
import { expect, vi } from 'vitest'

import type { NoteAnchor } from '../../src/shared/note'
import type { ReviewOutput, Round } from '../../src/shared/review'
import { inAgent, noUsage, stopped } from './scripted'

/** Scripted-Review fixtures shared by `review.test.ts` and `sync.test.ts`. */

/** A model that answers `generateObject` with this JSON, once per call. A
 * second element is what a refused first answer retries into. */
export function answers(...bodies: string[]) {
	let call = 0

	return new MockLanguageModelV3({
		doGenerate: async () => ({
			content: [{ type: 'text' as const, text: bodies[call++] ?? '' }],
			finishReason: stopped,
			usage: noUsage,
			warnings: [],
		}),
	})
}

/** One response: prose, then the Notes it produced. */
export function response(anchor: NoteAnchor): string {
	const output: ReviewOutput = {
		passages: [
			{
				prose: 'Two supporting points do most of the work in this section.',
				label: 'on the first point',
				notes: [
					{
						type: 'repetition',
						anchor,
						label: 're-argued',
						body: 'Cut to a clause.',
					},
				],
			},
			{ prose: 'The thesis itself appears twice, and that is within reason.', notes: [] },
		],
	}

	return JSON.stringify(output)
}

export const ask = {
	prompt: 'Review for repetition of the supporting logic.',
	depth: 'quick' as const,
}

/** The Round, once it has stopped running. `startReview` answers as soon as the
 * row exists and the model call carries on under `waitUntil`, so every test
 * waits on the row rather than on the call. */
export function settled(name: string): Promise<Round> {
	return vi.waitFor(async () => {
		const rounds = await inAgent(name, (agent) => agent.listRounds())
		const round = rounds[rounds.length - 1]

		expect(round?.state).not.toBe('running')

		return round
	})
}
