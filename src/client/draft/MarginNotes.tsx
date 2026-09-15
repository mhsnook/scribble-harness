import type { Editor } from '@tiptap/react'
import { useLayoutEffect, useRef, useState } from 'react'

import { cx } from '../lib/cx'
import type { NoteActions } from '../notes/actions'
import { NoteControls } from '../notes/NoteCard'
import type { AnchoredNote } from '../notes/useMarginNotes'
import { BLOCK_ID_ATTR } from './blocks'

/**
 * Accepted Notes drawn beside the paragraphs they are about — issue #81, and
 * screen 3(d).
 *
 * A Note is placed by measuring its first anchored Block and putting the card
 * at that height. Measuring rather than laying out, because the prose and the
 * margin are two columns of different lengths: three paragraphs can carry one
 * Note, and one paragraph can carry three.
 *
 * Tops are measured from the editor's own box, so this column has to start at
 * the same line the editor does — padding above it would push every card down
 * by that much.
 */

export interface MarginNotesProps {
	notes: readonly AnchoredNote[]
	/** Null until the editor has mounted. Taken whole rather than as its element,
	 * because the re-measure listens to it. */
	editor: Editor | null
	actions: NoteActions
	className?: string
}

/** Between two cards that would otherwise overlap. */
const GAP = 8

export function MarginNotes({ notes, editor, actions, className }: MarginNotesProps) {
	const cards = useRef(new Map<string, HTMLElement>())
	const [tops, setTops] = useState<ReadonlyMap<string, number>>(new Map())

	// Layout rather than effect: the cards are positioned from what was just
	// drawn, and an ordinary effect would let the browser paint them stacked at
	// zero first.
	useLayoutEffect(() => {
		const surface = editor?.view.dom
		if (editor === undefined || editor === null || surface === undefined) return

		const place = () => {
			// Measured out here rather than inside the updater. Reading the DOM is
			// not a pure computation, and React runs an updater twice under
			// StrictMode — which would measure the document twice per keystroke.
			const next = stack(notes, surface, cards.current)

			setTops((held) => (same(held, next) ? held : next))
		}

		// One measure per frame however many changes land in it. Each one forces
		// the browser to lay the whole document out before it can answer, so this
		// is the keystroke path and coalescing is the point.
		let frame = 0
		const schedule = () => {
			if (frame !== 0) return

			frame = requestAnimationFrame(() => {
				frame = 0
				place()
			})
		}

		place()

		// Typing above a Note moves it; so does the Panel changing width. The
		// editor reports the first even when the surface's own height does not
		// change, which it does not on a Draft short enough to be stretched by
		// `flex-auto`.
		editor.on('update', schedule)
		const watch = new ResizeObserver(schedule)
		watch.observe(surface)

		return () => {
			editor.off('update', schedule)
			watch.disconnect()
			if (frame !== 0) cancelAnimationFrame(frame)
		}
	}, [notes, editor])

	return (
		<div aria-label="Notes on this paragraph" className={cx('relative', className)}>
			{notes.map((note) => (
				<article
					key={note.id}
					ref={(held) => {
						if (held === null) cards.current.delete(note.id)
						else cards.current.set(note.id, held)
					}}
					className={cx(
						'absolute inset-x-0 flex flex-col gap-1.5 rounded-lg border border-accent-edge bg-accent-soft p-2',
						// Until it has been measured it would sit at the top of the
						// column, beside a paragraph it is not about.
						tops.has(note.id) ? 'opacity-100' : 'opacity-0',
					)}
					style={{ top: tops.get(note.id) ?? 0 }}
				>
					<p className="text-12 leading-relaxed text-ink">{note.body}</p>
					<div className="flex flex-wrap gap-1.5">
						<NoteControls actions={actions} note={note} />
					</div>
				</article>
			))}
		</div>
	)
}

function same(
	held: ReadonlyMap<string, number>,
	next: ReadonlyMap<string, number>,
): boolean {
	if (held.size !== next.size) return false

	for (const [id, top] of next) if (held.get(id) !== top) return false

	return true
}

/**
 * Where each card goes: beside its paragraph, pushed down past the card above
 * it rather than drawn over it.
 *
 * Read in document order rather than in the order the Guide wrote the Notes, so
 * the push-down is always downwards. Two Notes on one paragraph then read
 * top-to-bottom in the order they were written.
 */
function stack(
	notes: readonly AnchoredNote[],
	surface: HTMLElement,
	cards: ReadonlyMap<string, HTMLElement>,
): Map<string, number> {
	const at = blockTops(surface, new Set(notes.flatMap((note) => note.anchor.blockIds)))

	const placed = notes
		.map((note) => ({ note, top: wanted(note, at) }))
		.filter((one): one is { note: AnchoredNote; top: number } => one.top !== null)
		.sort((a, b) => a.top - b.top)

	const tops = new Map<string, number>()
	let floor = 0

	for (const { note, top } of placed) {
		const put = Math.max(top, floor)
		tops.set(note.id, put)
		floor = put + (cards.get(note.id)?.offsetHeight ?? 0) + GAP
	}

	return tops
}

/** The top of a Note's first anchored Block, or null when the Draft no longer
 * carries any of them. */
function wanted(note: AnchoredNote, at: ReadonlyMap<string, number>): number | null {
	const found = note.anchor.blockIds
		.map((id) => at.get(id))
		.filter((top): top is number => top !== undefined)

	return found.length === 0 ? null : Math.min(...found)
}

const ID_ATTR = `data-${BLOCK_ID_ATTR}`

/**
 * The top of each Block a Note actually names, relative to the surface.
 *
 * `:scope >` is load-bearing. `UniqueID` mints an id for every node type that
 * *can* be a top-level child, so a bare `[data-block-id]` also matches a
 * paragraph nested in a list item — and a Note measured against that one sits
 * at the wrong height inside a long list. Issues #54 and #81.
 *
 * Only the named Blocks are measured. Selecting them is a DOM read and costs
 * nothing much; each `getBoundingClientRect` makes the browser lay the document
 * out, so measuring all of them to place three cards is what would scale with
 * the length of the piece.
 */
function blockTops(
	surface: HTMLElement,
	named: ReadonlySet<string>,
): Map<string, number> {
	const tops = new Map<string, number>()
	if (named.size === 0) return tops

	const origin = surface.getBoundingClientRect().top

	for (const block of surface.querySelectorAll<HTMLElement>(`:scope > [${ID_ATTR}]`)) {
		const id = block.getAttribute(ID_ATTR)
		if (id !== null && named.has(id)) {
			tops.set(id, block.getBoundingClientRect().top - origin)
		}
	}

	return tops
}
