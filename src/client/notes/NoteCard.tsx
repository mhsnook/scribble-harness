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
	className?: string
}

export function NoteCard({ note, naming, actions, ordinal, className }: NoteCardProps) {
	const anchor = anchorLabel(note.anchor, naming)
	const settled = note.disposition === 'declined' || note.disposition === 'resolved'

	const meta = [
		ordinal === undefined ? null : String(ordinal).padStart(2, '0'),
		anchor.text,
		note.label,
		settled ? note.disposition : null,
	].filter((part) => part !== undefined && part !== null)

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
			<p className="label-meta">
				{meta.join(' · ')}
				{anchor.orphaned ? <span className="text-accent-ink"> · orphaned</span> : null}
			</p>

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
			className="flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left hover:bg-hush"
			onClick={onOpen}
			type="button"
		>
			<span className="label-meta shrink-0">{anchor.text}</span>
			<span className="min-w-0 flex-1 truncate text-12 text-muted">{note.body}</span>
		</button>
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
