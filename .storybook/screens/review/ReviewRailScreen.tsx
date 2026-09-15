import { ArticleBar } from '../../../src/client/components/ArticleBar'
import { DraftSurface } from '../../../src/client/components/DraftSurface'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { ArticleNotesPanel } from '../../../src/client/notes/ArticleNotesPanel'
import { ARTICLE_TITLE, draftParagraphs } from '../../mock/content'
import { reviewRounds } from '../../mock/review'
import { MockNotes } from './FullReviewScreen'

/**
 * 4(b) — Back in the Draft with the Review's Notes in the Panel beside it. The
 * Panel is still on the Round it ran, the way the Chat is still on its last
 * turn; `all notes` opens the whole record over it.
 */
export function ReviewRailScreen() {
	return (
		<MockNotes rounds={reviewRounds}>
			<Frame width={760}>
				<ArticleBar open={['draft', 'notes']} status="round 3" title={ARTICLE_TITLE} />
				<FrameBody className="h-[26rem]" row>
					<DraftSurface
						dimmed
						measure="narrow"
						paragraphs={draftParagraphs.slice(0, 3)}
					/>
					<ArticleNotesPanel divider="left" grow={0.4} />
				</FrameBody>
			</Frame>
		</MockNotes>
	)
}
