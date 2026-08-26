import { useLiveQuery } from '@tanstack/react-db'
import { useEffect, useState } from 'react'

import type { BlockRow } from '../../shared/draft'
import type { Note } from '../../shared/note'
import {
	type NotesQueue,
	notesQueue,
	type QueueView,
	wholeQueue,
} from '../../shared/notes-queue'
import type { ReviewDepth, Round } from '../../shared/review'
import { toNote, toRound } from '../../shared/sync'
import { useArticle } from '../lib/article'
import { failureText } from '../lib/failure'
import type { NoteActions } from './actions'
import { type AnchorNaming, anchorNaming } from './anchors'

/** The Notes Panel's half of one Article Agent. The rows are synced party-db
 * collections (architecture.md §12): they arrive as the Guide commits them,
 * and a ruling comes back the same way — so nothing here polls, reloads, or
 * patches local copies. */

export type NotesHandle = {
	queue: NotesQueue
	/** Every Note, unfiltered — a Round's response draws the ones it named
	 * whatever the queue is showing. */
	notes: readonly Note[]
	rounds: readonly Round[]
	loading: boolean
	failure: string | null
	view: QueueView
	setView: (view: QueueView) => void
	naming: AnchorNaming
	actions: NoteActions
	runReview: (prompt: string, depth: ReviewDepth) => void
}

export function useNotes(): NotesHandle {
	const { notes: store, draft, sync, plan: connection } = useArticle()

	const [blocks, setBlocks] = useState<BlockRow[]>([])
	const [failure, setFailure] = useState<string | null>(null)
	const [view, setView] = useState<QueueView>(wholeQueue)

	// Ordered by `seq` in the query, the way the server orders the tables.
	const noteRows = useLiveQuery(
		(q) => q.from({ note: sync.note }).orderBy(({ note }) => note.seq),
		[sync.note],
	)
	const roundRows = useLiveQuery(
		(q) => q.from({ round: sync.round }).orderBy(({ round }) => round.seq),
		[sync.round],
	)

	const notes = noteRows.data.map(toNote)
	const rounds = roundRows.data.map(toRound)

	// A Note's anchor is read against the Draft the Review itself read — so
	// "¶3" on a card is the paragraph the model was looking at, even if the
	// writer has typed since. The Blocks reload when a Round settles, which the
	// synced rows now announce; nothing loads until the snapshot has landed,
	// because a load keyed on the empty pre-snapshot list would run twice.
	const ready = noteRows.isReady && roundRows.isReady
	const lastSettled = rounds.findLast((round) => round.state !== 'running')?.id ?? null

	useEffect(() => {
		if (!ready) return

		let live = true

		draft.listBlocks().then(
			(listed) => {
				if (live) setBlocks(listed)
			},
			(error: unknown) => {
				if (live) setFailure(failureText('The Draft did not load.', error))
			},
		)

		return () => {
			live = false
		}
	}, [draft, ready, lastSettled])

	/** The write is the whole move: the ruled row comes back down the sync, so
	 * a success has nothing to patch and a failure has something to say. */
	const rule = (what: string, write: () => Promise<Note>) => {
		setFailure(null)
		write().catch((error: unknown) => setFailure(failureText(what, error)))
	}

	const actions: NoteActions = {
		accept: (note) =>
			rule('This Note was not accepted.', () =>
				store.setNoteDisposition(note.id, 'accepted'),
			),
		decline: (note) =>
			rule('This Note was not declined.', () =>
				store.setNoteDisposition(note.id, 'declined'),
			),
		resolve: (note) =>
			rule('This Note was not resolved.', () => store.resolveNote(note.id)),
		restore: (note) =>
			rule('This Note was not restored.', () => store.restoreNote(note.id)),
	}

	const queue = notesQueue(notes, view)
	const naming = anchorNaming(connection.plan, blocks)

	return {
		queue,
		notes,
		rounds,
		loading: !ready,
		failure,
		view,
		setView,
		naming,
		actions,

		runReview: (prompt, depth) => {
			setFailure(null)

			const asked = prompt.trim()
			if (asked === '') return

			// The Round arrives through the synced collection; the call's own
			// answer only matters when it is a refusal.
			store
				.startReview({
					prompt: asked,
					depth,
					// May be newer than the Plan the Article Agent has stored — §6.
					...(connection.plan === null ? {} : { plan: connection.plan }),
				})
				.catch((error: unknown) =>
					setFailure(failureText('The Review did not start.', error)),
				)
		},
	}
}
