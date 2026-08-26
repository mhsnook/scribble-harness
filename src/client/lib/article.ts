import { createContext, useContext } from 'react'

import type { BlockRow, DraftChange, DraftSaved } from '../../shared/draft'
import type { Note, NoteRuling } from '../../shared/note'
import type { Offer, Ruling } from '../../shared/offer'
import type { ReviewRequest, Round } from '../../shared/review'
import type { PlanConnection } from '../plan/usePlan'
import type { ArticleSync } from './sync'

/**
 * The seam one Article Agent arrives through, in stores because the server
 * holds the Plan and its rows apart — §3, rules 1 and 2. `useArticleAgent`
 * builds it; the Panels read it.
 */

/** The Article Agent's writer-facing `@callable` methods. */
export type OfferStore = {
	listOffers(): Promise<Offer[]>
	setOfferDisposition(id: string, ruling: Ruling): Promise<Offer>
	restoreOffer(id: string): Promise<Offer>
}

export type DraftStore = {
	listBlocks(): Promise<BlockRow[]>
	saveBlocks(change: DraftChange): Promise<DraftSaved>
}

/**
 * The writes the Notes Panel still makes over RPC. The reads are gone from
 * here: Notes and Rounds arrive through the synced collections on `sync`.
 *
 * `startReview` answers as soon as the Round row exists and the model call
 * carries on inside the Article Agent, so what comes back is a Round in flight
 * rather than a finished one.
 */
export type NoteStore = {
	startReview(request: ReviewRequest): Promise<Round>
	setNoteDisposition(id: string, ruling: NoteRuling): Promise<Note>
	resolveNote(id: string): Promise<Note>
	restoreNote(id: string): Promise<Note>
}

export type Article = {
	offers: OfferStore
	draft: DraftStore
	notes: NoteStore
	/** The party-db collections this Article syncs — live queries read these. */
	sync: ArticleSync
	plan: PlanConnection
}

const ArticleContext = createContext<Article | null>(null)

export const ArticleProvider = ArticleContext.Provider

export function useArticle(): Article {
	const article = useContext(ArticleContext)
	if (article === null) {
		throw new Error('An Article screen needs an ArticleProvider above it.')
	}

	return article
}
