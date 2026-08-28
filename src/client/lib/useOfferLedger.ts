import { useLiveQuery } from '@tanstack/react-db'
import { useState } from 'react'

import { offerLedger, type OfferLedger } from '../../shared/ledger'
import type { Offer } from '../../shared/offer'
import { toOffer } from '../../shared/sync'
import { acceptOffer } from '../plan/edits'
import { refusalText } from '../plan/refusalText'
import { useArticle } from './article'
import { failureText } from './failure'

/**
 * The Offer ledger, live: a live query over the synced `offer` collection,
 * writes over RPC — architecture.md §12. A research turn's rows land as the
 * Guide commits them, so nothing here asks for them.
 */

export type OfferLedgerHandle = {
	ledger: OfferLedger
	/** Until the collection's first snapshot arrives. */
	loading: boolean
	failure: string | null
	accept: (offer: Offer) => void
	decline: (offer: Offer) => void
	restore: (offer: Offer) => void
}

export function useOfferLedger(): OfferLedgerHandle {
	const { offers: store, sync, plan: connection } = useArticle()
	const { edit, plan } = connection
	const [failure, setFailure] = useState<string | null>(null)

	// Ordered by `seq` in the query, the way the server orders the table.
	const rows = useLiveQuery(
		(q) => q.from({ offer: sync.offer }).orderBy(({ offer }) => offer.seq),
		[sync.offer],
	)

	const offers = rows.data.map(toOffer)

	/** The ruled row returns through the sync; only a failure needs handling. */
	function run(what: string, write: () => Promise<Offer>) {
		setFailure(null)
		write().catch((error: unknown) => setFailure(failureText(what, error)))
	}

	return {
		ledger: offerLedger(offers),
		loading: !rows.isReady,
		failure,

		// Two writes against two stores, decoupled — §5, which says why this
		// order and not the other. The Plan goes first because the copy is built
		// from what the Offer says and needs nothing the ruling returns, and a
		// refused copy stops the ruling rather than sending it anyway.
		accept(offer) {
			setFailure(null)

			const refusal = edit((held) => acceptOffer(held, offer))
			if (refusal !== null) {
				const why = plan === null ? refusal.message : refusalText(plan, refusal)
				setFailure(`This Offer was not Accepted. ${why}`)

				return
			}

			run('This Offer was not Accepted.', () =>
				store.setOfferDisposition(offer.id, 'accepted'),
			)
		},

		decline(offer) {
			run('This Offer was not Declined.', () =>
				store.setOfferDisposition(offer.id, 'declined'),
			)
		},

		restore(offer) {
			run('This Offer was not restored.', () => store.restoreOffer(offer.id))
		},
	}
}
