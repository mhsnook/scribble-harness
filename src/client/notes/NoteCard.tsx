import type { Note } from '../../shared/note'
import { Button } from '../components/Button'
import { cx } from '../lib/cx'
import type { NoteActions } from './actions'
import { type AnchorNaming, anchorLabel } from './anchors'

/** One Note, drawn the same way in the queue and in a Review's response. */

export interface NoteCardProps {
	note: Note
	naming: AnchorNaming
	actions: NoteActions
	/** The queue's running number: "01". A response numbers nothing. */
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
				<Controls actions={actions} note={note} />
			</div>
		</article>
	)
}

/** Every disposition offers a way forward and a way back. */
function Controls({ note, actions }: { note: Note; actions: NoteActions }) {
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
