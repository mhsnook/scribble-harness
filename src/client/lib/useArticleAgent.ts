import { useAgent } from 'agents/react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'

import type { BlockRow, DraftChange, DraftSaved } from '../../shared/draft'
import { isFrame } from '../../shared/frame'
import type { Note, NoteRuling } from '../../shared/note'
import type { Offer, Ruling } from '../../shared/offer'
import type { Plan } from '../../shared/plan'
import {
	type ReviewFinished,
	reviewFinishedFrame,
	type ReviewRequest,
	type Round,
} from '../../shared/review'
import { usePlanChannel } from '../plan/usePlan'
import type { Article, DraftStore, NoteStore, OfferStore } from './article'
import { parseFrame } from './frames'

/**
 * Opens one Article Agent and hands out the three things that ride its one
 * multiplexed socket: the Plan channel, an Offer store over `@callable` RPC, and
 * the client itself for `useAgentChat` — §8. A second socket would mean a second
 * Plan writer, which §3 rule 1 forbids.
 */

export type ArticleSocket = ReturnType<typeof useAgent<Plan>>

export type ArticleConnection = {
	article: Article
	agent: ArticleSocket
}

/**
 * Builds the Article Agent without connecting to it. A plain GET on the Agent's
 * route wakes the Durable Object and runs its `onStart`, so the socket the
 * Article screen opens a moment later finds it already up. The answer is thrown
 * away, and a failure here only means the screen waits as it would have.
 */
export function wakeArticleAgent(articleId: string): void {
	// Same path routeAgentRequest maps onto the binding — see server/index.ts.
	void fetch(`/agents/article-agent/${encodeURIComponent(articleId)}`).catch(() => {})
}

export function useArticleAgent(articleId: string): ArticleConnection {
	// The Plan writer is built once, so it reaches the client through this rather
	// than closing over one. Filled in an effect, which is late enough: nothing
	// sends a Plan until the writer has typed.
	const socket = useRef<ArticleSocket | null>(null)
	const send = useEffectEvent((next: Plan) => socket.current?.setState(next))
	const channel = usePlanChannel(send)

	// The Round a `review_finished` frame last named. State rather than a
	// listener registry, so nothing holds a mutable set across renders.
	const [reviewFinished, setReviewFinished] = useState<string | null>(null)

	const agent = useAgent<Plan>({
		agent: 'article-agent',
		name: articleId,
		onStateUpdate: channel.onStateUpdate,
		// Parsed once and offered to both readers. A streamed Chat reply is
		// hundreds of frames, and each reader parsing for itself would double that
		// work for every one of them.
		onMessage: (event: MessageEvent) => {
			const frame = parseFrame(event.data)

			channel.onFrame(frame)
			if (isFrame<ReviewFinished>(frame, reviewFinishedFrame)) {
				setReviewFinished(frame.roundId)
			}
		},
	})

	useEffect(() => {
		socket.current = agent
	}, [agent])

	/** One `@callable` RPC on whichever client is current. */
	const call = useEffectEvent(
		<T>(method: string, args?: unknown[], timeout?: number): Promise<T> =>
			agent.call<T>(method, args, timeout === undefined ? undefined : { timeout }),
	)

	// Lazy `useState` and not `useMemo`, because the identity is the contract:
	// `useOfferLedger`, `useDraft` and `useNotes` each load once per store, and
	// React may recompute a `useMemo`.
	const [offers] = useState<OfferStore>(() => ({
		listOffers: () => call<Offer[]>('listOffers'),
		setOfferDisposition: (id: string, ruling: Ruling) =>
			call<Offer>('setOfferDisposition', [id, ruling]),
		restoreOffer: (id: string) => call<Offer>('restoreOffer', [id]),
	}))

	const [draft] = useState<DraftStore>(() => ({
		listBlocks: () => call<BlockRow[]>('listBlocks'),
		// Shorter than the SDK's 30-second default: a save that has not
		// landed leaves "Saving…" on screen, and half a minute of that says
		// something is fine when it is not.
		saveBlocks: (change: DraftChange) =>
			call<DraftSaved>('saveBlocks', [change], SAVE_TIMEOUT),
	}))

	const [notes] = useState<NoteStore>(() => ({
		listRounds: () => call<Round[]>('listRounds'),
		listNotes: () => call<Note[]>('listNotes'),
		// A short call even for a thorough pass — `NoteStore.startReview`.
		startReview: (request: ReviewRequest) => call<Round>('startReview', [request]),
		setNoteDisposition: (id: string, ruling: NoteRuling) =>
			call<Note>('setNoteDisposition', [id, ruling]),
		resolveNote: (id: string) => call<Note>('resolveNote', [id]),
		restoreNote: (id: string) => call<Note>('restoreNote', [id]),
	}))

	return {
		article: { offers, draft, notes, reviewFinished, plan: channel.connection },
		agent,
	}
}

/** How long a save may be in flight before it is called failed. */
const SAVE_TIMEOUT = 10_000
