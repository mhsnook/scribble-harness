import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/react'

import { BLOCK_ID_ATTR } from './blocks'

/**
 * Marks the Blocks an accepted Note points at, so the prose shows where a Note
 * in the margin is about — issue #81.
 *
 * **A decoration, not a mark**, because the Note lives in its own row, the
 * writer never typed this rule, and it must not reach the Final or the next
 * save — the same principle `docs/adr/0003` draws for a Proposal, which is
 * also drawn from state and never enters the document.
 *
 * Reading `doc.forEach` rather than the DOM also settles #54's trap for free:
 * it walks the document's direct children, so a paragraph nested in a list item
 * is never mistaken for a Block.
 */

const key = new PluginKey<readonly string[]>('anchoredBlocks')

/** The class the rule is drawn with — `.prose-draft .is-anchored` in theme.css. */
const ANCHORED = 'is-anchored'

export const AnchoredBlocks = Extension.create({
	name: 'anchoredBlocks',

	addProseMirrorPlugins() {
		return [
			new Plugin<readonly string[]>({
				key,
				state: {
					init: () => [],
					// Held across every other transaction, so typing does not clear the
					// rule until the Notes themselves change.
					apply: (tr, held) => (tr.getMeta(key) as string[] | undefined) ?? held,
				},
				props: {
					decorations(state) {
						const ids = new Set(key.getState(state) ?? [])
						if (ids.size === 0) return null

						const drawn: Decoration[] = []
						state.doc.forEach((node, pos) => {
							const id = node.attrs[BLOCK_ID_ATTR] as unknown
							if (typeof id === 'string' && ids.has(id)) {
								drawn.push(Decoration.node(pos, pos + node.nodeSize, { class: ANCHORED }))
							}
						})

						return DecorationSet.create(state.doc, drawn)
					},
				},
			}),
		]
	},
})

/** Hands the plugin the Blocks to mark. Dispatched rather than set, because the
 * decorations are read off editor state and nothing else re-runs them. */
export function markAnchored(editor: Editor, blockIds: readonly string[]): void {
	editor.view.dispatch(editor.state.tr.setMeta(key, [...blockIds]))
}
