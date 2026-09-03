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

/** One client per Article, held while a screen reads it. party-db ships a
 * transport `close()` since 0.0.3 (party-db#56), so a session that visits many
 * Articles no longer keeps a socket per Article open for its whole life — the
 * client closes once the last reader has been gone for `IDLE_CLOSE_MS`. */
type Held = {
	sync: ArticleSync
	close: () => void
	readers: number
	idle: ReturnType<typeof setTimeout> | undefined
}

const held = new Map<string, Held>()

/** How long an Article's client stays open with no reader. Long enough that
 * leaving an Article and coming back reuses the client rather than
 * reconnecting, and that React's development remount never closes one. */
const IDLE_CLOSE_MS = 10_000

/** The Article's collections — a lookup, not a connect, so it is safe in
 * render. `retainArticleSync` is what keeps the client open. */
export function articleSync(articleId: string): ArticleSync {
	return entry(articleId).sync
}

/**
 * Hold an Article's client open while a screen is reading it. Call from an
 * effect and return the release:
 *
 *     useEffect(() => retainArticleSync(articleId), [articleId])
 *
 * A collection may still be garbage-collected between renders — TanStack DB
 * drops one once its last subscriber leaves — and that is fine from 0.0.4 on:
 * party-db asks the room for the collection's snapshot when it registers again
 * (party-db#47), so a reopened panel refills itself. That is what retired the
 * standing `subscribeChanges` pin this file used to carry.
 */
export function retainArticleSync(articleId: string): () => void {
	const article = entry(articleId)
	article.readers += 1
	clearTimeout(article.idle)
	article.idle = undefined

	return () => {
		article.readers -= 1
		if (article.readers === 0) closeWhenIdle(articleId, article)
	}
}

function entry(articleId: string): Held {
	const existing = held.get(articleId)
	if (existing !== undefined) return existing

	const transport = partyTransport({
		host: window.location.host,
		party: 'article-agent',
		room: articleId,
	})
	const { db, close } = createPartyDb(transport, syncCollections)

	const article: Held = {
		sync: {
			note: db.note as Collection<NoteRow>,
			round: db.round as Collection<RoundRow>,
			offer: db.offer as Collection<OfferRow>,
		},
		close,
		readers: 0,
		idle: undefined,
	}
	held.set(articleId, article)
	// nothing is reading it yet: a render that never mounts must not leave a
	// socket open for the rest of the session.
	closeWhenIdle(articleId, article)

	return article
}

function closeWhenIdle(articleId: string, article: Held): void {
	clearTimeout(article.idle)
	article.idle = setTimeout(() => {
		if (article.readers > 0) return
		held.delete(articleId)
		// one way: the next reader builds a fresh client, socket and collections.
		article.close()
	}, IDLE_CLOSE_MS)
}
