import { type ReactNode, useState } from 'react'

import { ArticleBar } from '../../../src/client/components/ArticleBar'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { Panel } from '../../../src/client/components/Panel'
import { ArticleProvider } from '../../../src/client/lib/article'
import type { NoteActions } from '../../../src/client/notes/actions'
import { anchorNaming } from '../../../src/client/notes/anchors'
import { RoundView } from '../../../src/client/notes/RoundView'
import type { Note } from '../../../src/shared/note'
import { restoredTo } from '../../../src/shared/note'
import type { Round } from '../../../src/shared/review'
import { ARTICLE_TITLE, plan } from '../../mock/content'
import { memoryArticle, memoryDraftStore } from '../../mock/MockArticle'
import { reviewNotes, reviewRound, reviewRounds } from '../../mock/review'

/**
 * 4(a) — One Review, read whole. The Notes Panel's own view, wider here because
 * the other Panels are closed.
 */
export function FullReviewScreen() {
	const [notes, setNotes] = useState<Note[]>(reviewNotes)

	const move = (note: Note, disposition: Note['disposition']) =>
		setNotes((held) =>
			held.map((one) => (one.id === note.id ? { ...one, disposition } : one)),
		)

	const actions: NoteActions = {
		accept: (note) => move(note, 'accepted'),
		decline: (note) => move(note, 'declined'),
		resolve: (note) => move(note, 'resolved'),
		restore: (note) => move(note, restoredTo(note.disposition) ?? 'proposed'),
	}

	return (
		<Frame width={760}>
			<ArticleBar open={['notes']} status="round 3" title={ARTICLE_TITLE} />
			<FrameBody className="h-[32rem]" row>
				<Panel variant="sunk">
					<RoundView
						actions={actions}
						following
						naming={anchorNaming(draft)}
						notes={notes}
						onPick={() => {}}
						onRunAgain={() => {}}
						onSaveSkill={() => {}}
						round={reviewRound}
						rounds={reviewRounds}
					/>
				</Panel>
			</FrameBody>
		</Frame>
	)
}

export interface MockNotesProps {
	children: ReactNode
	rounds?: readonly Round[]
	notes?: readonly Note[]
	/** What a Review comes back with, for a screen that runs one. */
	answer?: { passages: Round['passages']; notes: readonly Note[] }
}

/**
 * The Article seam a Review reads: the Plan for its Section numbers, the Draft
 * for its paragraph numbers, and the synced collections holding the rows.
 *
 * The seam is built once per screen, because the hooks over it read once per
 * store — rebuilding on every render would reload the rows and throw away
 * every ruling the story had made.
 */
export function MockNotes({
	children,
	rounds = [],
	notes = reviewNotes,
	answer,
}: MockNotesProps) {
	const [seam] = useState(() => ({
		draft: memoryDraftStore({ seed: draft }),
		...memoryArticle({ rounds, notes, answer }),
	}))

	return (
		<ArticleProvider
			value={{
				...seam,
				plan: { plan, edit: () => null, refusal: null, rejected: null },
			}}
		>
			{children}
		</ArticleProvider>
	)
}

/** Enough Blocks that the anchored Notes number themselves. */
const draft = Array.from({ length: 8 }, (_, index) => ({
	id: `b${index + 1}`,
	ord: index + 1,
	json: {
		type: 'paragraph',
		content: [{ type: 'text', text: `Paragraph ${index + 1}.` }],
	},
}))
