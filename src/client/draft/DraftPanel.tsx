import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { useEffect } from 'react'

import type { BlockRow } from '../../shared/draft'
import { Notice } from '../components/Notice'
import { Panel, PanelHeader, type PanelProps } from '../components/Panel'
import { toDoc } from './blocks'
import { draftExtensions } from './editor'
import type { DraftStatus } from './writer'

export interface DraftPanelProps {
	/** What the Article Agent holds. Read once, when the editor is built. */
	blocks: readonly BlockRow[]
	status: DraftStatus
	onAttach: (editor: Editor) => void
	onChange: () => void
	divider?: PanelProps['divider']
	/** This Panel's share of the Panel row — `panelShare`. */
	grow?: PanelProps['grow']
	className?: string
}

/**
 * The writing surface. It renders the Blocks it is handed and reports every
 * change; loading and saving are `ArticleDraftPanel`'s.
 *
 * Who may write here, and why the writer places their own headings and section
 * breaks, is docs/architecture.md §3 and §10.
 */
export function DraftPanel({
	blocks,
	status,
	onAttach,
	onChange,
	divider,
	grow,
	className,
}: DraftPanelProps) {
	const editor = useEditor({
		extensions: draftExtensions,
		content: toDoc(blocks),
		// Turns a document the schema cannot read into a failure rather than a
		// silent truncation, which matters now that the next save is derived from
		// whatever survived the parse.
		enableContentCheck: true,
		onContentError: ({ error }) => console.error('The Draft did not parse.', error),
		onUpdate: onChange,
	})

	useEffect(() => {
		if (editor !== null) onAttach(editor)
	}, [editor, onAttach])

	return (
		<Panel className={className} divider={divider} grow={grow} padded={false}>
			{/* Sticky, so the controls stay in reach however far down the Draft the
			    writer has scrolled — and so does whether the last save landed. The
			    Panel is the scroller, which is what this sticks against. */}
			<div className="sticky top-0 z-10 flex flex-col gap-2.5 border-b border-rule bg-surface px-3.5 pt-3.5 pb-2.5">
				<PanelHeader meta={<SaveState status={status} />} title="Draft" />
				<Toolbar editor={editor} />
				{status.state === 'failed' ? <Notice>{status.failure}</Notice> : null}
			</div>

			{/* Heading, subheading, and section-break styling is `.prose-draft` in
			    theme.css, so a Draft preview is set the same way as the editor.

			    The measure is padding on `.ProseMirror` rather than on anything
			    around it, and the editable grows to the foot of the Panel: every
			    point below the toolbar is then inside the editable, so a click in
			    the gutter or in the space under the last line puts the caret in
			    the prose instead of landing on a dead wrapper. */}
			<EditorContent
				className="prose-draft flex min-w-0 flex-auto flex-col [&_.ProseMirror]:flex-auto [&_.ProseMirror]:px-8 [&_.ProseMirror]:py-4 [&_.ProseMirror]:outline-none"
				editor={editor}
			/>
		</Panel>
	)
}

/** Only a save in flight or one that failed is worth a writer's attention
 * mid-sentence. */
function SaveState({ status }: { status: DraftStatus }) {
	if (status.state === 'failed') return <span className="text-accent-ink">not saved</span>
	if (status.state === 'saving') return <>saving…</>
	if (status.savedAt === null) return null

	return <>saved</>
}

function Toolbar({ editor }: { editor: Editor | null }) {
	// A transaction does not re-render React, so reading `isActive` in the body
	// would leave every control showing the state the caret was in when the Panel
	// last rendered. The selector re-renders only when one of these flips.
	const active = useEditorState({
		editor,
		selector: ({ editor: live }) =>
			live === null
				? null
				: {
						bold: live.isActive('bold'),
						italic: live.isActive('italic'),
						underline: live.isActive('underline'),
						heading: live.isActive('heading', { level: 2 }),
						subheading: live.isActive('heading', { level: 3 }),
					},
	})

	if (editor === null || active === null) return null

	const chain = () => editor.chain().focus()

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<Control active={active.bold} onClick={() => chain().toggleBold().run()}>
				bold
			</Control>
			<Control active={active.italic} onClick={() => chain().toggleItalic().run()}>
				italic
			</Control>
			<Control active={active.underline} onClick={() => chain().toggleUnderline().run()}>
				underline
			</Control>
			<Control
				active={active.heading}
				onClick={() => chain().toggleHeading({ level: 2 }).run()}
			>
				heading
			</Control>
			<Control
				active={active.subheading}
				onClick={() => chain().toggleHeading({ level: 3 }).run()}
			>
				subheading
			</Control>
			<Control active={false} onClick={() => chain().setHorizontalRule().run()}>
				section break
			</Control>
		</div>
	)
}

function Control({
	active,
	onClick,
	children,
}: {
	active: boolean
	onClick: () => void
	children: string
}) {
	return (
		<button
			aria-pressed={active}
			className={`rounded-md border px-2 py-0.5 text-12 ${
				active
					? 'border-accent-edge bg-accent-soft text-accent-ink'
					: 'border-edge text-muted'
			}`}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	)
}
