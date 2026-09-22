import { z } from 'zod'

/**
 * The Draft — context.md. One row per Block, meaning per paragraph, ordered by
 * a fractional index so inserting between two Blocks renumbers neither.
 *
 * A Block's content is the editor's own JSON, carried as an opaque object —
 * docs/adr/0003 for why, and for what changing editor would then cost.
 */

/** One Block's content, as the editor serialises it. */
export type BlockJson = { type: string } & Record<string, unknown>

/** One Block row. */
export type BlockRow = {
	id: string
	/** Fractional index. Carried across edits so an insert renumbers nothing. */
	ord: number
	json: BlockJson
}

/**
 * What one save carries. A delta rather than the whole Draft, so a client can
 * only ever remove a Block it has already seen — a second tab's paragraph is
 * not deletable by a client that has never heard of it.
 */
export type DraftChange = {
	blocks: BlockRow[]
	removed: string[]
}

/** What the Article Agent answers a save with. The rows are not echoed, because the
 * client already holds them, and the editor owns the text either way. */
export type DraftSaved = {
	savedAt: number
	written: number
	removed: number
}

export const blockRowSchema = z.strictObject({
	id: z.string().min(1),
	// `JSON.stringify(NaN)` is `null`, so an ord that went wrong arrives as null
	// and is refused here rather than sorting arbitrarily on the next load.
	ord: z.number().finite(),
	// Loose, because the shape belongs to the editor. Only the discriminator the
	// document format guarantees is required.
	json: z.looseObject({ type: z.string().min(1) }),
})

export const draftChangeSchema = z.strictObject({
	blocks: z.array(blockRowSchema),
	removed: z.array(z.string().min(1)),
})

/**
 * What one Block reads as, with the formatting dropped.
 *
 * The content is the editor's own JSON and stays opaque everywhere else. This reads it
 * out as text, because a Review has to put the prose in a prompt and the Worker has no
 * editor to ask. This walks what every ProseMirror-shaped document guarantees — a node
 * holds `content`, and a leaf holds `text` — so it does not need to know which node
 * types exist. A Block with no text, a section break for instance, reads as an
 * empty string, and the caller decides what to do with that.
 */
export function blockText(json: BlockJson): string {
	const node = json as { text?: unknown; content?: unknown }

	if (typeof node.text === 'string') return node.text
	if (!Array.isArray(node.content)) return ''

	return node.content.map((child) => blockText(child as BlockJson)).join('')
}

/**
 * Where each Block sits, numbered from 1. Takes the Blocks already in reading
 * order, which is what `listBlocks` answers with.
 *
 * This is what "¶3" means, and it is derived rather than stored, because `ord` is a
 * fractional index that says what follows what and nothing about position. The
 * server numbers the prose it sends the model here, and the client numbers a
 * Note's anchor here, so the two cannot disagree about which paragraph ¶3 is.
 */
export function blockOrdinals(blocks: readonly BlockRow[]): Map<string, number> {
	return new Map(blocks.map((block, index) => [block.id, index + 1]))
}

/** Kept well under the row cap, because a Durable Object caps a row at 2 MB and one
 * pasted data-url can reach it. The client cannot see this failure, so the Article
 * Agent is where it is caught. */
export const MAX_BLOCK_BYTES = 64 * 1024
export const MAX_CHANGE_BYTES = 1024 * 1024

/** Shared, so the Agent and the in-memory store word these the same. */
export function blockTooLarge(id: string, bytes: number): Error {
	return new Error(
		`Block ${id} is ${bytes} bytes, over the ${MAX_BLOCK_BYTES}-byte limit for one Block.`,
	)
}

export function draftChangeTooLarge(bytes: number): Error {
	return new Error(
		`That save is ${bytes} bytes, over the ${MAX_CHANGE_BYTES}-byte limit for one write.`,
	)
}

/** Refuses a change no row store should be asked to write. Shared so the size
 * rule is stated once and the same sentence reaches the writer either way. */
export function checkChangeSize(change: DraftChange): void {
	let totalBytes = 0

	for (const block of change.blocks) {
		const blockBytes = JSON.stringify(block.json).length
		if (blockBytes > MAX_BLOCK_BYTES) throw blockTooLarge(block.id, blockBytes)
		totalBytes += blockBytes
	}

	if (totalBytes > MAX_CHANGE_BYTES) throw draftChangeTooLarge(totalBytes)
}
