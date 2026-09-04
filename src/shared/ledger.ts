import type { Disposition, Offer } from './offer'
import type { Plan, Reference } from './plan'

/**
 * The Offer ledger — `docs/chat.md`. The View reads Offers and nothing
 * else, because the Ledger belongs to the Chat Panel and what the Plan did with
 * a copy is the Plan Panel's. The two below are the copy Accepting sends across,
 * which is the one thing that does travel between them.
 */

export type OfferLedger = {
	/** In the order the Article Agent recorded them. */
	offers: readonly Offer[]
	byDisposition: Record<Disposition, Offer[]>
	/** `all` included, so the filter chips read from one place. */
	counts: Record<'all' | Disposition, number>
}

/** Found on Provenance, not on content: the writer edits their copy. It guards
 * the send, so Accepting twice copies once. */
export function referenceForOffer(plan: Plan, offerId: string): Reference | undefined {
	return plan.references.find((reference) => reference.provenance.offerId === offerId)
}

/** Copied rather than moved — architecture.md §4.5. It reads what the Offer says and not
 * what the writer ruled, so the copy can be built before the ruling is sent. */
export function referenceFromOffer(offer: Offer, id: string): Reference {
	// Absent rather than undefined — `docs/plan.md`.
	const reference: Reference = {
		id,
		type: offer.type,
		provenance: { type: 'offer', offerId: offer.id },
		nodeId: null,
	}
	if (offer.text !== undefined) reference.text = offer.text
	if (offer.source !== undefined) reference.source = offer.source
	if (offer.note !== undefined) reference.note = offer.note

	return reference
}

/** Derived on read. The Offers arrive whole from their store, so a second copy
 * would only need keeping in step. */
export function offerLedger(offers: readonly Offer[]): OfferLedger {
	const byDisposition: Record<Disposition, Offer[]> = {
		undecided: [],
		accepted: [],
		declined: [],
	}
	for (const offer of offers) byDisposition[offer.disposition].push(offer)

	return {
		offers,
		byDisposition,
		counts: {
			all: offers.length,
			undecided: byDisposition.undecided.length,
			accepted: byDisposition.accepted.length,
			declined: byDisposition.declined.length,
		},
	}
}
