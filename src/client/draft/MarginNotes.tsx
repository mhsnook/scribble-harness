import { useLayoutEffect, useRef, useState } from 'react'

import type { Note } from '../../shared/note'
import { Button } from '../components/Button'
import { cx } from '../lib/cx'
import type { NoteActions } from '../notes/actions'
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
	notes: readonly Note[]
	/** The `.ProseMirror` element. Null until the editor has mounted. */
	surface: HTMLElement | null
	/** Bumped by the caller on every document change, so a reflow re-measures.
	 * The value is never read — only that it differs. */
	revision: number
	actions: NoteActions
	className?: string
}

/** Between two cards that would otherwise overlap. */
const GAP = 8

export function MarginNotes({
	notes,
	surface,
	revision,
	actions,
	className,
}: MarginNotesProps) {
	const cards = useRef(new Map<string, HTMLElement>())
	const [tops, setTops] = useState<ReadonlyMap<string, number>>(new Map())

	// Layout rather than effect: the cards are positioned from what was just
	// drawn, and an ordinary effect would let the browser paint them stacked at
	// zero first.
	useLayoutEffect(() => {
		if (surface === null) return

		// Held when the numbers come back the same, because `notes` is a fresh
		// array on every render: a new Map each time would re-render, re-run this,
		// and never settle.
		const place = () =>
			setTops((held) => {
				const next = stack(notes, surface, cards.current)

				return same(held, next) ? held : next
			})

		place()

		// Typing above a Note moves it, and so does the Panel changing width.
		const watch = new ResizeObserver(place)
		watch.observe(surface)

		return () => watch.disconnect()
	}, [notes, surface, revision])

	if (notes.length === 0) return null

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
						<Button onClick={() => actions.resolve(note)} size="sm">
							resolve
						</Button>
						<Button onClick={() => actions.restore(note)} size="sm" variant="link">
							undo
						</Button>
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
	notes: readonly Note[],
	surface: HTMLElement,
	cards: ReadonlyMap<string, HTMLElement>,
): Map<string, number> {
	const at = blockTops(surface)

	const placed = notes
		.map((note) => ({ note, top: wanted(note, at) }))
		.filter((one): one is { note: Note; top: number } => one.top !== null)
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
function wanted(note: Note, at: ReadonlyMap<string, number>): number | null {
	if (note.anchor.kind !== 'blocks') return null

	const found = note.anchor.blockIds
		.map((id) => at.get(id))
		.filter((top): top is number => top !== undefined)

	return found.length === 0 ? null : Math.min(...found)
}

/**
 * Every Block's top, relative to the surface.
 *
 * `:scope >` is load-bearing. `UniqueID` mints an id for every node type that
 * *can* be a top-level child, so a bare `[data-block-id]` also matches a
 * paragraph nested in a list item — and a Note measured against that one sits
 * at the wrong height inside a long list. Issues #54 and #81.
 */
function blockTops(surface: HTMLElement): Map<string, number> {
	const tops = new Map<string, number>()
	const origin = surface.getBoundingClientRect().top

	for (const block of surface.querySelectorAll<HTMLElement>(
		`:scope > [data-${BLOCK_ID_ATTR}]`,
	)) {
		const id = block.dataset[attrKey]
		if (id !== undefined) tops.set(id, block.getBoundingClientRect().top - origin)
	}

	return tops
}

/** `data-block-id` reads back off `dataset` as `blockId`. */
const attrKey = BLOCK_ID_ATTR.replace(/-([a-z])/g, (_, letter: string) =>
	letter.toUpperCase(),
)
