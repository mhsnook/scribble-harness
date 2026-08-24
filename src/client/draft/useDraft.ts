import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'

import type { BlockRow } from '../../shared/draft'
import type { DraftStore } from '../lib/article'
import { failureText } from '../lib/failure'
import { toRows } from './blocks'
import { createDraftWriter, type DraftStatus } from './writer'

export type DraftConnection = {
	/** The Blocks the Article Agent holds, and null until they arrive. */
	blocks: BlockRow[] | null
	/** Why the Draft could not be read. Nothing is rendered to write in when
	 * this is set: an empty surface would say the Draft is empty when it is not. */
	failure: string | null
	status: DraftStatus
	/** Call once it has mounted, so a save has something to read. */
	attachEditor: (editor: Editor) => void
	/** The editor changed. */
	touch: () => void
}

/**
 * Reads the Draft once and writes it back as the writer types — §3, rule 2.
 *
 * Nothing reloads it: §3 leaves this client as the Blocks' only writer, so a
 * second read could only replace what is on screen with an older copy of it.
 */
export function useDraft(store: DraftStore): DraftConnection {
	const [blocks, setBlocks] = useState<BlockRow[] | null>(null)
	const [failure, setFailure] = useState<string | null>(null)
	const [status, setStatus] = useState<DraftStatus>({ state: 'clean', savedAt: null })

	const editorRef = useRef<Editor | null>(null)

	// An Effect Event, so the writer can read the editor on save without the ref
	// being touched during render.
	const read = useEffectEvent((previous: readonly BlockRow[]) =>
		editorRef.current === null ? previous : toRows(editorRef.current.state.doc, previous),
	)

	// One per mount: the cleanup below disposes on `writer` changing.
	const [writer] = useState(() =>
		createDraftWriter({
			read,
			save: (change) => store.saveBlocks(change),
			onStatus: setStatus,
			describeFailure: (error) => failureText('The Draft did not save.', error) ?? '',
		}),
	)

	useEffect(() => {
		let live = true

		store.listBlocks().then(
			(rows) => {
				if (live) setBlocks(rows)
			},
			(error: unknown) => {
				if (live) setFailure(failureText('The Draft did not open.', error))
			},
		)

		return () => {
			live = false
		}
	}, [store])

	// Hiding the Draft Panel destroys effects, so this runs then as well as on
	// the way out of the Article. The writer survives it — see `dispose`.
	useEffect(() => () => writer.dispose(), [writer])

	// The last save is the one most likely to be lost, so leaving with one owed
	// asks first. Nothing can be sent from here: an RPC frame queued during
	// unload may never leave the browser.
	useEffect(() => {
		if (status.state === 'clean') return

		const ask = (event: BeforeUnloadEvent) => {
			writer.flush()
			event.preventDefault()
		}

		window.addEventListener('beforeunload', ask)
		return () => window.removeEventListener('beforeunload', ask)
	}, [status.state, writer])

	const attachEditor = useCallback(
		(editor: Editor) => {
			editorRef.current = editor

			// Seeded from the editor's own document rather than from the rows, so a
			// Block the editor read back unchanged is never rewritten. Seeding from
			// the rows would make anything ProseMirror normalised look unsaved, and
			// the first save would replace the stored copy with the normalised one.
			writer.load(toRows(editor.state.doc, blocks ?? []))
		},
		[blocks, writer],
	)

	return { blocks, failure, status, attachEditor, touch: writer.touch }
}
