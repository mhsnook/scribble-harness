import type { Note, NoteDisposition } from './note'

/** The View the Notes Panel reads — a query over Notes, the way the Offer
 * ledger is a query over Offers (`docs/chat.md`). */

export type QueueView = {
	acceptedOnly: boolean
	showResolved: boolean
}

export const wholeQueue: QueueView = { acceptedOnly: false, showResolved: false }

export type NotesQueue = {
	/** What to draw, in the order the Guide wrote them. */
	visible: readonly Note[]
	/** `all` included, so the filter chips read from one place. `accepted` is
	 * also what the writer still owes the piece, since resolving moves a Note
	 * out of it. */
	counts: Record<'all' | NoteDisposition, number>
}

/** Derived on read. */
export function notesQueue(
	notes: readonly Note[],
	view: QueueView = wholeQueue,
): NotesQueue {
	const counts: Record<'all' | NoteDisposition, number> = {
		all: notes.length,
		proposed: 0,
		accepted: 0,
		declined: 0,
		resolved: 0,
	}
	for (const note of notes) counts[note.disposition] += 1

	return { visible: notes.filter((note) => shows(note.disposition, view)), counts }
}

function shows(disposition: NoteDisposition, view: QueueView): boolean {
	if (disposition === 'resolved') return view.showResolved
	if (view.acceptedOnly) return disposition === 'accepted'

	return true
}
