import { Check, ChevronDown, type LucideIcon, X } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'

import type { Note, NoteDisposition } from '../../shared/note'
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
	/** Adds a control that folds the card back to a line. */
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

	const meta = [
		ordinal === undefined ? undefined : String(ordinal).padStart(2, '0'),
		anchor.text,
		note.label,
	].filter((part) => part !== undefined)

	const label = (
		<>
			<DispositionMark disposition={note.disposition} />
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
				className,
			)}
		>
			{onCollapse === undefined ? (
				<p className="label-meta flex items-center gap-1.5">{label}</p>
			) : (
				<button
					aria-expanded
					className="label-meta -m-1 flex items-center gap-1.5 rounded-md p-1 text-left hover:text-ink"
					onClick={onCollapse}
					type="button"
				>
					<ChevronDown aria-hidden className="size-3.5 shrink-0" />
					{label}
				</button>
			)}

			<p
				className={cx(
					'text-13 leading-tight text-ink',
					note.disposition === 'resolved' && 'line-through',
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

/** Maps a disposition to its icon. `accepted` and `resolved` share `Check`, so
 * they are only told apart as long as `NoteCard` strikes a resolved body
 * through. */
const marks: Record<NoteDisposition, LucideIcon | null> = {
	proposed: null,
	accepted: Check,
	declined: X,
	resolved: Check,
}

/** Marks a Note with the writer's ruling. */
function DispositionMark({ disposition }: { disposition: NoteDisposition }) {
	const Mark = marks[disposition]
	if (Mark === null) return null

	return (
		<>
			<Mark
				aria-hidden
				className={cx(
					'size-3.5 shrink-0',
					disposition === 'accepted' ? 'text-accent-edge' : 'text-faint',
				)}
			/>
			<span className="sr-only">{disposition}</span>
		</>
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
			<span className="label-meta flex shrink-0 items-center gap-1.5">
				<DispositionMark disposition={note.disposition} />
				{anchor.text}
			</span>
			<span
				className={cx(
					'min-w-0 flex-1 truncate text-12 text-muted',
					note.disposition === 'resolved' && 'line-through',
				)}
			>
				{note.body}
			</span>
		</button>
	)
}

export interface GradedNoteProps {
	note: Note
	naming: AnchorNaming
	actions: NoteActions
	className?: string
}

/** A Note as a card while it is proposed, and as a line once it is ruled on,
 * which the writer can open and close. */
export function GradedNote({ note, naming, actions, className }: GradedNoteProps) {
	const [open, setOpen] = useState(false)
	const [moving, setMoving] = useState(false)
	const inner = useRef<HTMLDivElement>(null)
	const [height, setHeight] = useState<number | null>(null)

	// Sets the wrapper's height from the measured inner box, because CSS cannot
	// transition to or from a height of `auto`.
	useLayoutEffect(() => {
		const box = inner.current
		if (box === null) return

		const measure = () => setHeight(box.offsetHeight)
		measure()

		// Re-measures whenever the inner box changes size, which it does on the
		// swap between line and card, and when the Panel's width reflows the
		// body.
		const watch = new ResizeObserver(measure)
		watch.observe(box)

		return () => watch.disconnect()
	}, [])

	const settled = note.disposition !== 'proposed'

	const show = (next: boolean) => {
		setMoving(true)
		setOpen(next)
	}

	return (
		<div
			className={cx(
				'transition-[height] duration-200 ease-out motion-reduce:transition-none',
				// Clips while the height moves, because the inner box is already at
				// its new height and would spill. Stops clipping after that, because
				// the focus outline sits outside the button and would be cut.
				moving && 'overflow-hidden',
				className,
			)}
			onTransitionEnd={() => setMoving(false)}
			style={height === null ? undefined : { height }}
		>
			<div ref={inner}>
				{settled && !open ? (
					<NoteLine naming={naming} note={note} onOpen={() => show(true)} />
				) : (
					<NoteCard
						actions={actions}
						naming={naming}
						note={note}
						{...(settled ? { onCollapse: () => show(false) } : {})}
					/>
				)}
			</div>
		</div>
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
