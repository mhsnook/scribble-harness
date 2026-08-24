import { type ReactNode, useState } from 'react'

import {
	ArticleProvider,
	type DraftStore,
	type NoteStore,
	type OfferStore,
	useArticle,
} from '../../src/client/lib/article'
import { createPlanWriter } from '../../src/client/plan/writer'
import type { BlockRow, DraftChange } from '../../src/shared/draft'
import {
	alreadyRuled,
	missingNote,
	type Note,
	type NoteDisposition,
	notAccepted,
	notRestorable,
	restoredTo,
} from '../../src/shared/note'
import {
	missingOffer,
	notDeclined,
	type Offer,
	type Ruling,
} from '../../src/shared/offer'
import { emptyPlan, type Plan, type Refusal } from '../../src/shared/plan'
import type { ReviewRequest, Round } from '../../src/shared/review'
import { offers as seeded, plan as seededPlan } from './content'

/**
 * An Article held in memory, so a story runs the real Ledger and the real
 * applier without a Worker. Supplies the same two halves the Article Agent does,
 * behind the real `createPlanWriter` with a `send` that goes nowhere.
 */
export function MockArticle({ children }: { children: ReactNode }) {
	const [plan, setPlan] = useState<Plan>(seededPlan)
	const [refusal, setRefusal] = useState<Refusal | null>(null)

	// `send` goes nowhere, so the debounce is the only part that idles.
	const [writer] = useState(() => {
		const held = createPlanWriter({
			send: () => {},
			onPlan: setPlan,
			onRefusal: setRefusal,
		})
		held.receive(seededPlan)

		return held
	})

	// One store per story, for the reason `useArticleAgent` gives: the three
	// readers each load once per store identity.
	const [offers] = useState(() => memoryOfferStore(seeded))
	const [draft] = useState(() => memoryDraftStore())
	const [notes] = useState(() => memoryNoteStore())

	const edit = (next: Parameters<typeof writer.edit>[0]) => {
		setRefusal(null)

		return writer.edit(next)
	}

	return (
		<ArticleProvider
			value={{
				offers,
				draft,
				notes,
				reviewFinished: null,
				plan: { plan, edit, refusal, rejected: null },
			}}
		>
			{children}
		</ArticleProvider>
	)
}

/**
 * The Plan a story is looking at. `MockArticle` seeds one before it renders, so
 * the empty fallback only satisfies the type. A Panel in the app gates on null
 * instead: it would otherwise draw the empty Plan as a real one, and a Proposal
 * card would name each of its Sections as missing.
 */
export function useMockPlan(): Plan {
	return useArticle().plan.plan ?? blank
}

const blank = emptyPlan()

/**
 * A Draft held in memory. `stall` leaves the load unanswered so a story can
 * show what the Panel does while it waits; `reject` refuses every save.
 */
export function memoryDraftStore(
	options: {
		seed?: readonly BlockRow[]
		stall?: boolean
		reject?: string
	} = {},
): DraftStore & { saves: DraftChange[] } {
	const rows = new Map((options.seed ?? []).map((row) => [row.id, { ...row }]))
	const saves: DraftChange[] = []

	return {
		saves,

		listBlocks: () =>
			options.stall === true
				? new Promise<BlockRow[]>(() => {})
				: Promise.resolve([...rows.values()].sort((a, b) => a.ord - b.ord)),

		saveBlocks: (change: DraftChange) => {
			saves.push(change)
			if (options.reject !== undefined) return Promise.reject(new Error(options.reject))

			for (const id of change.removed) rows.delete(id)
			for (const block of change.blocks) rows.set(block.id, { ...block })

			return Promise.resolve({
				savedAt: Date.now(),
				written: change.blocks.length,
				removed: change.removed.length,
			})
		},
	}
}

/**
 * The Notes and Rounds held in memory, running the real queue and the real
 * ruling rules.
 *
 * `answer` is what a Review comes back with, after a beat — enough for a story
 * to run the whole loop: ask, wait, read the response, rule on what it found.
 * Leaving it out leaves every Review running, which is the state a story shows
 * when it is about the waiting.
 */
export function memoryNoteStore(
	options: {
		rounds?: readonly Round[]
		notes?: readonly Note[]
		answer?: { passages: Round['passages']; notes: readonly Note[] }
		/** How long a Review takes to come back. */
		takes?: number
		/** Called with the Round id when one settles, as the socket frame does. */
		onFinished?: (roundId: string) => void
	} = {},
): NoteStore {
	const rounds = (options.rounds ?? []).map((round) => ({ ...round }))
	const rows = (options.notes ?? []).map((note) => ({ ...note }))

	const find = (id: string): Note => {
		const note = rows.find((held) => held.id === id)
		if (note === undefined) throw missingNote(id)

		return note
	}

	const move = (note: Note, disposition: NoteDisposition) => {
		const moved = {
			...note,
			disposition,
			decidedAt: disposition === 'proposed' ? null : Date.now(),
		}
		rows.splice(rows.indexOf(note), 1, moved)

		return Promise.resolve(moved)
	}

	return {
		listRounds: () => Promise.resolve(rounds.map((round) => ({ ...round }))),
		listNotes: () => Promise.resolve(rows.map((note) => ({ ...note }))),

		startReview: (request: ReviewRequest) => {
			// Minted, not counted off the length: a story seeds Rounds whose ids and
			// ordinals start past 1.
			const round: Round = {
				id: crypto.randomUUID(),
				ordinal: rounds.reduce((highest, held) => Math.max(highest, held.ordinal), 0) + 1,
				state: 'running',
				prompt: request.prompt,
				depth: request.depth,
				passages: [],
				failure: null,
				startedAt: Date.now(),
				finishedAt: null,
			}
			rounds.push(round)

			const { answer } = options
			if (answer !== undefined) {
				setTimeout(() => {
					rows.push(...answer.notes.map((note) => ({ ...note, roundId: round.id })))
					rounds.splice(rounds.indexOf(round), 1, {
						...round,
						state: 'done',
						passages: answer.passages,
						finishedAt: Date.now(),
					})
					options.onFinished?.(round.id)
				}, options.takes ?? 600)
			}

			return Promise.resolve({ ...round })
		},

		setNoteDisposition: (id: string, ruling) => {
			const note = find(id)
			if (note.disposition !== 'proposed') return Promise.reject(alreadyRuled(note))

			return move(note, ruling)
		},

		resolveNote: (id: string) => {
			const note = find(id)
			if (note.disposition !== 'accepted') return Promise.reject(notAccepted(note))

			return move(note, 'resolved')
		},

		restoreNote: (id: string) => {
			const note = find(id)
			const back = restoredTo(note.disposition)
			if (back === null) return Promise.reject(notRestorable(note))

			return move(note, back)
		},
	}
}

export function memoryOfferStore(seed: readonly Offer[]): OfferStore {
	const rows = seed.map((offer) => ({ ...offer }))

	const find = (id: string): Offer => {
		const offer = rows.find((held) => held.id === id)
		if (offer === undefined) throw missingOffer(id)

		return offer
	}

	const rule = (
		offer: Offer,
		disposition: Offer['disposition'],
		decidedAt: number | null,
	) => {
		const ruled = { ...offer, disposition, decidedAt }
		rows.splice(rows.indexOf(offer), 1, ruled)

		return Promise.resolve(ruled)
	}

	return {
		listOffers: () => Promise.resolve(rows.map((offer) => ({ ...offer }))),

		setOfferDisposition: (id: string, ruling: Ruling) =>
			rule(find(id), ruling, Date.now()),

		restoreOffer: (id: string) => {
			const offer = find(id)
			if (offer.disposition !== 'declined') return Promise.reject(notDeclined(offer))

			return rule(offer, 'undecided', null)
		},
	}
}
