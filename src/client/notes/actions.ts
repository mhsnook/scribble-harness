import type { Note } from '../../shared/note'
import type { NoteStore } from '../lib/article'
import { failureText } from '../lib/failure'

/** The four ways the writer moves one Note, passed as one object because every
 * surface that draws a Note passes all four through. */
export type NoteActions = {
	accept: (note: Note) => void
	decline: (note: Note) => void
	resolve: (note: Note) => void
	restore: (note: Note) => void
}

/**
 * The rulings, wired to one store.
 *
 * Shared because ruling is the same write wherever the writer does it — in a
 * Round's response, in the ledger, or beside the prose. The ruled row comes
 * back through the sync, so nothing here returns anything; only a refusal needs
 * the caller.
 */
export function noteActions(
	store: NoteStore,
	onFailure: (why: string | null) => void,
): NoteActions {
	const rule = (what: string, write: () => Promise<Note>) => {
		onFailure(null)
		write().catch((error: unknown) => onFailure(failureText(what, error)))
	}

	return {
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
}
