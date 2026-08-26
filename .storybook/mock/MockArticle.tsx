import { createCollection } from '@tanstack/db'
import { type ReactNode, useState } from 'react'

import {
	ArticleProvider,
	type DraftStore,
	type NoteStore,
	type OfferStore,
	useArticle,
} from '../../src/client/lib/article'
import type { ArticleSync } from '../../src/client/lib/sync'
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
import { type NoteRow, type RoundRow, toNote, toRound } from '../../src/shared/sync'
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

	// One store per story, for the reason `useArticleAgent` gives: the readers
	// each load once per store identity, and the collections hold the rows.
	const [offers] = useState(() => memoryOfferStore(seeded))
	const [draft] = useState(() => memoryDraftStore())
	const [{ store: notes, sync }] = useState(() => memoryNotes())

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
				sync,
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

/** One synced collection held in memory: seeded on sync, written to by the
 * memory store the way the Article Agent's `commit` fans out. */
function memoryCollection<Row extends { id: string }>(seed: readonly Row[]) {
	type Sink = {
		begin: () => void
		write: (op: { type: 'insert' | 'update' | 'delete'; value: Row }) => void
		commit: () => void
		markReady: () => void
	}

	let sink: Sink | null = null

	const collection = createCollection<Row>({
		getKey: (row) => row.id,
		startSync: true,
		sync: {
			sync: (params: Sink) => {
				sink = params
				params.begin()
				for (const row of seed) params.write({ type: 'insert', value: { ...row } })
				params.commit()
				params.markReady()
			},
		},
	})

	const write = (op: { type: 'insert' | 'update'; value: Row }) => {
		sink?.begin()
		sink?.write(op)
		sink?.commit()
	}

	return { collection, write }
}

function noteToRow(note: Note, seq: number): NoteRow {
	return {
		seq,
		id: note.id,
		round_id: note.roundId,
		type: note.type,
		anchor: JSON.stringify(note.anchor),
		label: note.label ?? null,
		body: note.body,
		disposition: note.disposition,
		created_at: note.createdAt,
		decided_at: note.decidedAt,
	}
}

function roundToRow(round: Round): RoundRow {
	return {
		seq: round.ordinal,
		id: round.id,
		state: round.state,
		prompt: round.prompt,
		depth: round.depth,
		passages: JSON.stringify(round.passages),
		failure: round.failure,
		started_at: round.startedAt,
		finished_at: round.finishedAt,
	}
}

/**
 * The Notes and Rounds held in memory: real synced collections behind the
 * real live queries, plus a store running the real ruling rules — the same
 * two halves `useArticleAgent` hands the Panels.
 *
 * `answer` is what a Review comes back with, after a beat — enough for a story
 * to run the whole loop: ask, wait, read the response, rule on what it found.
 * Leaving it out leaves every Review running, which is the state a story shows
 * when it is about the waiting.
 */
export function memoryNotes(
	options: {
		rounds?: readonly Round[]
		notes?: readonly Note[]
		answer?: { passages: Round['passages']; notes: readonly Note[] }
		/** How long a Review takes to come back. */
		takes?: number
	} = {},
): { store: NoteStore; sync: ArticleSync } {
	let noteSeq = 0
	const note = memoryCollection<NoteRow>(
		(options.notes ?? []).map((one) => noteToRow(one, ++noteSeq)),
	)
	const round = memoryCollection<RoundRow>((options.rounds ?? []).map(roundToRow))

	const find = (id: string): NoteRow => {
		const row = note.collection.get(id)
		if (row === undefined) throw missingNote(id)

		return row
	}

	const move = (row: NoteRow, disposition: NoteDisposition) => {
		const moved: NoteRow = {
			...row,
			disposition,
			decided_at: disposition === 'proposed' ? null : Date.now(),
		}
		note.write({ type: 'update', value: moved })

		return Promise.resolve(toNote(moved))
	}

	const store: NoteStore = {
		startReview: (request: ReviewRequest) => {
			// Minted, not counted off the length: a story seeds Rounds whose ids and
			// ordinals start past 1.
			const ordinal =
				[...round.collection.values()].reduce(
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
			round.write({ type: 'insert', value: row })

			const { answer } = options
			if (answer !== undefined) {
				setTimeout(() => {
					for (const found of answer.notes) {
						note.write({
							type: 'insert',
							value: noteToRow({ ...found, roundId: row.id }, ++noteSeq),
						})
					}
					round.write({
						type: 'update',
						value: {
							...row,
							state: 'done',
							passages: JSON.stringify(answer.passages),
							finished_at: Date.now(),
						},
					})
				}, options.takes ?? 600)
			}

			return Promise.resolve(toRound(row))
		},

		setNoteDisposition: (id: string, ruling) => {
			const row = find(id)
			if (row.disposition !== 'proposed') {
				return Promise.reject(alreadyRuled(toNote(row)))
			}

			return move(row, ruling)
		},

		resolveNote: (id: string) => {
			const row = find(id)
			if (row.disposition !== 'accepted') {
				return Promise.reject(notAccepted(toNote(row)))
			}

			return move(row, 'resolved')
		},

		restoreNote: (id: string) => {
			const row = find(id)
			const back = restoredTo(row.disposition)
			if (back === null) return Promise.reject(notRestorable(toNote(row)))

			return move(row, back)
		},
	}

	return { store, sync: { note: note.collection, round: round.collection } }
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
