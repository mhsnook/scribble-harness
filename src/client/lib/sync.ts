import type { Collection } from '@tanstack/db'
import { createPartyDb, partyTransport } from 'party-db/client'

import { type NoteRow, type RoundRow, syncCollections } from '../../shared/sync'

/**
 * One party-db connection per Article — the second socket of architecture.md
 * §12, beside the Agents SDK's. It syncs the `note` and `round` collections
 * down; nothing writes up it, because rulings go over RPC and the Article
 * Agent refuses collection writes.
 */

export type ArticleSync = {
	note: Collection<NoteRow>
	round: Collection<RoundRow>
}

/** Held for the session once opened: party-db does not yet expose a way to
 * close a transport's socket (party-db#46), so handing out one client per
 * Article is what keeps a writer moving between Articles from stacking
 * reconnect loops. The open socket also keeps each collection's `?since`
 * cursor warm, so a reconnect catches up instead of re-snapshotting. */
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
	}

	// Pin both collections with a standing subscription. TanStack DB cleans a
	// collection up once its last subscriber leaves, and a party-db collection
	// that restarts gets no second snapshot — the stream only carries what
	// commits after it (party-db#47). Pinned, the rows a closed Panel synced
	// are still there when it reopens.
	sync.note.subscribeChanges(() => {})
	sync.round.subscribeChanges(() => {})

	held.set(articleId, sync)

	return sync
}
