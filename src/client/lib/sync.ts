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

/** One client per Article, held open while a screen reads it and closed once
 * the last reader leaves. */
type Held = {
	sync: ArticleSync
	close: () => void
	readers: number
	idle: ReturnType<typeof setTimeout> | undefined
}

const held = new Map<string, Held>()

const IDLE_CLOSE_MS = 10_000

/** A lookup, not a connect, so it is safe in render. */
export function articleSync(articleId: string): ArticleSync {
	return entry(articleId).sync
}

/** Holds the Article's client open until the returned release is called. */
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
	// nothing has retained it yet: a render that never mounts closes on this timer.
	closeWhenIdle(articleId, article)

	return article
}

function closeWhenIdle(articleId: string, article: Held): void {
	clearTimeout(article.idle)
	article.idle = setTimeout(() => {
		if (article.readers > 0) return
		held.delete(articleId)
		// closing is one way: the next reader builds a fresh client.
		article.close()
	}, IDLE_CLOSE_MS)
}
