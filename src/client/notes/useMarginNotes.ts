import { useLiveQuery } from '@tanstack/react-db'
import { useMemo } from 'react'

import type { Note, NoteAnchor } from '../../shared/note'
import { toNote } from '../../shared/sync'
import { useArticle } from '../lib/article'
import { type NoteActions, noteActions } from './actions'

/**
 * The Notes the Draft draws in its margin: accepted, and pointing at
 * paragraphs — issue #81.
 *
 * Its own live query rather than a prop from the Notes Panel, because the
 * margin is there whether that Panel is open or not. Both queries read one
 * synced collection, so the second costs a filter rather than a fetch.
 */

/** A Note the margin can place. The narrowing the query did, in the type, so
 * nothing downstream has to test `kind` again to reach `blockIds`. */
export type AnchoredNote = Note & {
	anchor: Extract<NoteAnchor, { kind: 'blocks' }>
}

export type MarginNotesHandle = {
	/** In the order the Guide wrote them. The margin re-sorts by position. */
	notes: readonly AnchoredNote[]
	/** Every Block any of them names, for the rule under the prose. */
	blockIds: readonly string[]
	actions: NoteActions
}

export function useMarginNotes(
	onFailure: (why: string | null) => void,
): MarginNotesHandle {
	const { notes: store, sync } = useArticle()

	// Ordered by `seq` in the query, the way the server orders the table.
	const rows = useLiveQuery(
		(q) => q.from({ note: sync.note }).orderBy(({ note }) => note.seq),
		[sync.note],
	)

	// Both of the margin's effects key on what this returns, and one of them
	// re-measures the document. `rows.data` is already stable between renders, so
	// this pins the identity here rather than leaving two consumers to depend on
	// that holding.
	return useMemo(() => {
		// A Note about the whole piece has no paragraph to sit beside, so the
		// margin is not where it belongs — it stays in the Panel.
		const notes = rows.data
			.map(toNote)
			.filter(
				(note): note is AnchoredNote =>
					note.disposition === 'accepted' && note.anchor.kind === 'blocks',
			)

		return {
			notes,
			blockIds: notes.flatMap((note) => note.anchor.blockIds),
			actions: noteActions(store, onFailure),
		}
	}, [rows.data, store, onFailure])
}
