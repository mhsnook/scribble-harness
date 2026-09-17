import { useState } from 'react'

import type { Note } from '../../shared/note'
import { Button } from '../components/Button'
import { cx } from '../lib/cx'
import type { NoteActions } from './actions'
import { type AnchorNaming, anchorLabel } from './anchors'

/** One Note, drawn the same way wherever it appears. */

export interface NoteCardProps {
	note: Note
	naming: AnchorNaming
	actions: NoteActions
	/** The queue's running number: "01". A Round's response numbers nothing. */
	ordinal?: number
	/** Folds the card back to its line. Given only by a caller that opened it
	 * from one, which is why the card has no such control by default. */
	onCollapse?: () => void
	className?: string
}

export function NoteCard({
	note,
	naming,
	actions,
	ordinal,
	onCollapse,
	className,
}: NoteCardProps) {
	const anchor = anchorLabel(note.anchor, naming)
	const settled = note.disposition === 'declined' || note.disposition === 'resolved'

	const meta = [
		ordinal === undefined ? undefined : String(ordinal).padStart(2, '0'),
		anchor.text,
		note.label,
		settled ? note.disposition : undefined,
	].filter((part) => part !== undefined)

	const label = (
		<>
			{meta.join(' · ')}
			{anchor.orphaned ? <span className="text-accent-ink"> · orphaned</span> : null}
		</>
	)

	return (
		<article
			className={cx(
				'flex flex-col gap-1.5 rounded-lg border p-2.5',
				note.disposition === 'accepted'
					? 'border-accent-edge bg-accent-soft'
					: 'border-edge bg-surface',
				settled && 'opacity-55',
				className,
			)}
		>
			{onCollapse === undefined ? (
				<p className="label-meta">{label}</p>
			) : (
				<button
					aria-expanded
					className="label-meta -m-1 flex items-baseline gap-1.5 rounded-md p-1 text-left hover:text-ink"
					onClick={onCollapse}
					type="button"
				>
					<span aria-hidden>▾</span>
					<span>{label}</span>
				</button>
			)}

			<p
				className={cx(
					'text-13 leading-relaxed text-ink',
					note.disposition === 'declined' && 'line-through',
				)}
			>
				{note.body}
			</p>

			<div className="mt-0.5 flex flex-wrap gap-1.5">
				<NoteControls actions={actions} note={note} />
			</div>
		</article>
	)
}

export interface NoteLineProps {
	note: Note
	naming: AnchorNaming
	/** Opens the full card in its place. */
	onOpen: () => void
}

/**
 * A Note the writer has already ruled on, as one line: where it points, and as
 * much of the body as the column fits.
 *
 * The line is the whole click target rather than carrying its own controls. A
 * settled Note has one thing left to do to it — undo — and offering that on
 * every line would put the rarest action in front of the writer most often.
 */
export function NoteLine({ note, naming, onOpen }: NoteLineProps) {
	const anchor = anchorLabel(note.anchor, naming)

	return (
		<button
			aria-expanded={false}
			className="flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left hover:bg-hush"
			onClick={onOpen}
			type="button"
		>
			<span className="label-meta shrink-0">{anchor.text}</span>
			<span className="min-w-0 flex-1 truncate text-12 text-muted">{note.body}</span>
		</button>
	)
}

export interface GradedNoteProps {
	note: Note
	naming: AnchorNaming
	actions: NoteActions
	className?: string
}

/**
 * One Note at the size its disposition has earned: a card while the writer
 * still owes it a ruling, one line once they have given one.
 *
 * The writer opens a line back into a card and folds it away again, and this
 * holds that. Held per Note rather than per list, so the two lists that grade
 * — the Round on screen and the ledger — do not have to agree on anything.
 */
export function GradedNote({ note, naming, actions, className }: GradedNoteProps) {
	const [open, setOpen] = useState(false)

	if (note.disposition === 'proposed') {
		return (
			<NoteCard actions={actions} className={className} naming={naming} note={note} />
		)
	}

	return open ? (
		<NoteCard
			actions={actions}
			className={className}
			naming={naming}
			note={note}
			onCollapse={() => setOpen(false)}
		/>
	) : (
		<NoteLine naming={naming} note={note} onOpen={() => setOpen(true)} />
	)
}

/**
 * Every disposition offers a way forward and a way back.
 *
 * Exported because the margin draws its own card — it has no `naming` for the
 * meta line and needs to be placed absolutely — but the rulings it offers are
 * these, and there is one right answer to what an accepted Note can do next.
 */
export function NoteControls({ note, actions }: { note: Note; actions: NoteActions }) {
	if (note.disposition === 'proposed') {
		return (
			<>
				<Button onClick={() => actions.accept(note)} size="sm">
					accept
				</Button>
				<Button onClick={() => actions.decline(note)} size="sm" variant="quiet">
					decline
				</Button>
			</>
		)
	}

	if (note.disposition === 'accepted') {
		return (
			<>
				<Button onClick={() => actions.resolve(note)} size="sm">
					resolve
				</Button>
				<Button onClick={() => actions.restore(note)} size="sm" variant="link">
					undo
				</Button>
			</>
		)
	}

	return (
		<Button onClick={() => actions.restore(note)} size="sm" variant="link">
			undo
		</Button>
	)
}
