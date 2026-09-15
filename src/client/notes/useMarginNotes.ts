import { useLiveQuery } from '@tanstack/react-db'
import { useState } from 'react'

import type { Note } from '../../shared/note'
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

export type MarginNotesHandle = {
	/** In the order the Guide wrote them. The margin re-sorts by position. */
	notes: readonly Note[]
	failure: string | null
	actions: NoteActions
}

export function useMarginNotes(): MarginNotesHandle {
	const { notes: store, sync } = useArticle()
	const [failure, setFailure] = useState<string | null>(null)

	// Ordered by `seq` in the query, the way the server orders the table.
	const rows = useLiveQuery(
		(q) => q.from({ note: sync.note }).orderBy(({ note }) => note.seq),
		[sync.note],
	)

	// A Note about the whole piece has no paragraph to sit beside, so the margin
	// is not where it belongs — it stays in the Panel.
	const notes = rows.data
		.map(toNote)
		.filter((note) => note.disposition === 'accepted' && note.anchor.kind === 'blocks')

	return { notes, failure, actions: noteActions(store, setFailure) }
}
