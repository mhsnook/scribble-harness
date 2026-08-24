import { ArticleBar } from '../../../src/client/components/ArticleBar'
import { Chip } from '../../../src/client/components/Chip'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { GuidanceNote } from '../../../src/client/components/GuidanceNote'
import { ARTICLE_TITLE, draftParagraphs } from '../../mock/content'

/**
 * 3(d) — Notes anchored in the margin, beside the paragraph they are about.
 * The rule down the left of that paragraph is the anchor; the note is the only
 * accented thing on the page.
 */
export function MarginNotesScreen() {
	return (
		<Frame width={720}>
			<ArticleBar title={ARTICLE_TITLE} open={['draft', 'notes']} status="§3" />
			<FrameBody className="h-[19rem] gap-5 px-5 py-5">
				<div className="flex gap-5">
					<div className="prose-draft min-w-0 flex-1">
						<p className="text-15">{draftParagraphs[0]}</p>
					</div>
					<div className="w-[11rem] shrink-0" />
				</div>

				<div className="flex gap-5">
					<div className="prose-draft min-w-0 flex-1 border-l-2 border-accent-edge pl-4">
						<p className="text-15">{draftParagraphs[1]}</p>
					</div>
					<GuidanceNote
						anchor="§3"
						confidence="confident"
						live
						title="You're restating §2 here"
						body="The permit-process argument already landed. §3 is meant to be the cost of the delay to people."
						actions={
							<>
								<Chip variant="outline" interactive>
									accept
								</Chip>
								<Chip variant="muted" interactive>
									×
								</Chip>
							</>
						}
						className="w-[11rem] shrink-0 self-start"
					/>
				</div>

				<div className="flex gap-5">
					<div className="prose-draft min-w-0 flex-1">
						<p className="text-15">{draftParagraphs[2]}</p>
					</div>
					<p className="flex w-[11rem] shrink-0 items-center text-11 text-faint">
						Notes hold their place beside the paragraph they're about, and scroll with it.
					</p>
				</div>
			</FrameBody>
		</Frame>
	)
}
