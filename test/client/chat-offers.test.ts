import { describe, expect, it } from 'vitest'

import { readRecordedOffers } from '../../src/client/chat/offers'
import { proposePlanChangeTool, recordOffersTool } from '../../src/shared/chat'
import { toolPart } from './chat-fixtures'

/** Reading a research turn's result, which is what the transcript's Offer cards
 * are drawn from. The rows themselves arrive through the sync — §12. */

const part = (state: string, extra: Record<string, unknown> = {}) =>
	toolPart(recordOffersTool, state, { input: { offers: [] }, ...extra })

const recorded = [
	{ id: 'offer-a', name: 'A study', disposition: 'undecided', duplicate: false },
	{ id: 'offer-b', name: 'A quote', disposition: 'accepted', duplicate: true },
]

describe('a research turn', () => {
	it('hands back the ids the Ledger holds rows for', () => {
		const found = readRecordedOffers(
			part('output-available', { output: recorded }) as never,
		)

		expect(found).toEqual(recorded)
	})

	it('reads nothing off a call that has not resolved', () => {
		expect(readRecordedOffers(part('input-available') as never)).toBeNull()
	})

	it('reads nothing off a Proposal', () => {
		const proposal = toolPart(proposePlanChangeTool, 'output-available', {
			input: { ops: [] },
			output: 'done',
		})

		expect(readRecordedOffers(proposal as never)).toBeNull()
	})
})
