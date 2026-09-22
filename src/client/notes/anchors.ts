import type { BlockRow } from '../../shared/draft'
import { blockOrdinals } from '../../shared/draft'
import type { NoteAnchor } from '../../shared/note'

/**
 * A stored anchor names ids; the writer reads positions. This turns the first
 * into the second — `docs/reviews.md`.
 */

export type AnchorNaming = {
	/** Block id → where it sits in the Draft, counted from 1. */
	paragraphOrdinals: ReadonlyMap<string, number>
}

/** Built once per Draft. Every Note on screen asks one of these questions on
 * every render. */
export function anchorNaming(blocks: readonly BlockRow[]): AnchorNaming {
	return { paragraphOrdinals: blockOrdinals(blocks) }
}

export type AnchorLabel = {
	text: string
	/** What it named is gone from the Draft. */
	orphaned: boolean
}

export function anchorLabel(anchor: NoteAnchor, naming: AnchorNaming): AnchorLabel {
	if (anchor.kind === 'article') return { text: 'whole piece', orphaned: false }

	// Read as the span from its first paragraph to its last, because a run's
	// `blockIds` are contiguous paragraphs.
	const numbers = anchor.blockIds
		.map((id) => naming.paragraphOrdinals.get(id))
		.filter((one): one is number => one !== undefined)
		.sort((a, b) => a - b)

	if (numbers.length === 0) return { text: 'a paragraph that is gone', orphaned: true }

	const first = numbers[0]
	const last = numbers[numbers.length - 1]

	return { text: first === last ? `¶${first}` : `¶${first}–¶${last}`, orphaned: false }
}
