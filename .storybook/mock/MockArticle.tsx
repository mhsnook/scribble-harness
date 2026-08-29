import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { type ReactNode, useState } from 'react'

import {
	type Article,
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
	type Disposition,
	missingOffer,
	notDeclined,
	type Offer,
	type Ruling,
} from '../../src/shared/offer'
import { emptyPlan, type Plan, type Refusal } from '../../src/shared/plan'
import type { ReviewRequest, Round } from '../../src/shared/review'
import {
	fromNote,
	fromOffer,
	fromRound,
	type NoteRow,
	type OfferRow,
	type RoundRow,
	toNote,
	toOffer,
	toRound,
} from '../../src/shared/sync'
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

	// One draft store and one seam per story: `useDraft` and `useNotes` load once
	// per `draft` store identity, and the seam's collections hold the rows.
	const [draft] = useState(() => memoryDraftStore())
	const [seam] = useState(() => memoryArticle({ offers: seeded }))

	const edit = (next: Parameters<typeof writer.edit>[0]) => {
		setRefusal(null)

		return writer.edit(next)
	}

	return (
		<ArticleProvider
			value={{ ...seam, draft, plan: { plan, edit, refusal, rejected: null } }}
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

/** A local-only collection standing in for a synced one. */
function memoryCollection<Row extends { id: string }>(seed: Row[]) {
	return createCollection(
		localOnlyCollectionOptions({ getKey: (row: Row) => row.id, initialData: seed }),
	)
}

/**
 * One Article seam held in memory: real collections behind the real live
 * queries, plus the stores running the real ruling rules — the same two halves
 * `useArticleAgent` hands the Panels.
 *
 * `answer` is what a Review comes back with, after a beat — enough for a story
 * to run the whole loop: ask, wait, read the response, rule on what it found.
 * Leaving it out leaves every Review running, which is the state a story shows
 * when it is about the waiting.
 */
export function memoryArticle(
	options: {
		offers?: readonly Offer[]
		rounds?: readonly Round[]
		notes?: readonly Note[]
		answer?: { passages: Round['passages']; notes: readonly Note[] }
		/** How long a Review takes to come back. */
		takes?: number
	} = {},
): Pick<Article, 'notes' | 'offers' | 'sync'> {
	let noteSeq = 0
	const note = memoryCollection<NoteRow>(
		(options.notes ?? []).map((one) => fromNote(one, ++noteSeq)),
	)
	const round = memoryCollection<RoundRow>((options.rounds ?? []).map(fromRound))

	const offer = memoryCollection<OfferRow>(
		(options.offers ?? []).map((one, index) => ({ ...fromOffer(one), seq: index + 1 })),
	)

	const findNote = (id: string): NoteRow => {
		const row = note.get(id)
		if (row === undefined) throw missingNote(id)

		return row
	}

	const moveNote = (row: NoteRow, disposition: NoteDisposition) => {
		const decidedAt = disposition === 'proposed' ? null : Date.now()
		note.update(row.id, (draft) => {
			draft.disposition = disposition
			draft.decided_at = decidedAt
		})

		return Promise.resolve(toNote({ ...row, disposition, decided_at: decidedAt }))
	}

	const notes: NoteStore = {
		startReview: (request: ReviewRequest) => {
			// Minted, not counted off the length: a story seeds Rounds whose ids and
			// ordinals start past 1.
			const ordinal =
				[...round.values()].reduce(
					(highest, held) => Math.max(highest, held.seq ?? 0),
					0,
				) + 1
			const row: RoundRow = {
				seq: ordinal,
				id: crypto.randomUUID(),
				state: 'running',
				prompt: request.prompt,
				depth: request.depth,
				passages: '[]',
				failure: null,
				started_at: Date.now(),
				finished_at: null,
			}
			round.insert(row)

			const { answer } = options
			if (answer !== undefined) {
				setTimeout(() => {
					for (const found of answer.notes) {
						note.insert(fromNote({ ...found, roundId: row.id }, ++noteSeq))
					}
					round.update(row.id, (draft) => {
						draft.state = 'done'
						draft.passages = JSON.stringify(answer.passages)
						draft.finished_at = Date.now()
					})
				}, options.takes ?? 600)
			}

			return Promise.resolve(toRound(row))
		},

		setNoteDisposition: (id: string, ruling) => {
			const row = findNote(id)
			if (row.disposition !== 'proposed') {
				return Promise.reject(alreadyRuled(toNote(row)))
			}

			return moveNote(row, ruling)
		},

		resolveNote: (id: string) => {
			const row = findNote(id)
			if (row.disposition !== 'accepted') {
				return Promise.reject(notAccepted(toNote(row)))
			}

			return moveNote(row, 'resolved')
		},

		restoreNote: (id: string) => {
			const row = findNote(id)
			const back = restoredTo(row.disposition)
			if (back === null) return Promise.reject(notRestorable(toNote(row)))

			return moveNote(row, back)
		},
	}

	const findOffer = (id: string): OfferRow => {
		const row = offer.get(id)
		if (row === undefined) throw missingOffer(id)

		return row
	}

	const moveOffer = (row: OfferRow, disposition: Disposition) => {
		const decidedAt = disposition === 'undecided' ? null : Date.now()
		offer.update(row.id, (draft) => {
			draft.disposition = disposition
			draft.decided_at = decidedAt
		})

		return Promise.resolve(toOffer({ ...row, disposition, decided_at: decidedAt }))
	}

	const offers: OfferStore = {
		setOfferDisposition: (id: string, ruling: Ruling) => moveOffer(findOffer(id), ruling),

		restoreOffer: (id: string) => {
			const row = findOffer(id)
			if (row.disposition !== 'declined') {
				return Promise.reject(notDeclined(toOffer(row)))
			}

			return moveOffer(row, 'undecided')
		},
	}

	return { notes, offers, sync: { note, round, offer } }
}
