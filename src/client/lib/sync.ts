import type { Collection } from '@tanstack/db'
import { createPartyDb, partyTransport } from 'party-db/client'

import {
	type NoteRow,
	type OfferRow,
	type RoundRow,
	syncCollections,
} from '../../shared/sync'

/**
 * One party-db connection per Article — the second socket of architecture.md
 * §12, carrying the `note`, `round` and `offer` collections.
 */

export type ArticleSync = {
	note: Collection<NoteRow>
	round: Collection<RoundRow>
	offer: Collection<OfferRow>
}

/** Held for the session: party-db has no transport close yet (party-db#46),
 * so one client per Article is the bound on open sockets — the carry in
 * architecture.md §11. */
const held = new Map<string, ArticleSync>()

export function articleSync(articleId: string): ArticleSync {
	const existing = held.get(articleId)
	if (existing !== undefined) return existing

	const transport = partyTransport({
		host: window.location.host,
		party: 'article-agent',
		room: articleId,
	})
	const { db } = createPartyDb(transport, syncCollections)

	const sync: ArticleSync = {
		note: db.note as Collection<NoteRow>,
		round: db.round as Collection<RoundRow>,
		offer: db.offer as Collection<OfferRow>,
	}

	// Pin every collection: TanStack DB garbage-collects a collection once its
	// last subscriber leaves, and a party-db collection that restarts gets no
	// second snapshot (party-db#47; the other §11 carry).
	sync.note.subscribeChanges(() => {})
	sync.round.subscribeChanges(() => {})
	sync.offer.subscribeChanges(() => {})

	held.set(articleId, sync)

	return sync
}
