import { ArticleBar } from '../../../src/client/components/ArticleBar'
import { Button } from '../../../src/client/components/Button'
import { Check } from '../../../src/client/components/Check'
import { Chip } from '../../../src/client/components/Chip'
import { DraftSurface } from '../../../src/client/components/DraftSurface'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { GuidanceNote } from '../../../src/client/components/GuidanceNote'
import { PanelHeader } from '../../../src/client/components/Panel'
import { ARTICLE_TITLE, draftParagraphs } from '../../mock/content'

/**
 * 3(e) — The notes rail: a quiet stack on the right. Accepted notes drop into
 * a checklist underneath, which is what you actually work through.
 */
export function NotesRailScreen() {
	return (
		<Frame width={720}>
			<ArticleBar title={ARTICLE_TITLE} open={['draft', 'notes']} status="§3 of 4" />
			<FrameBody row className="h-[19rem]">
				<DraftSurface paragraphs={draftParagraphs} measure="narrow" caret />

				<aside className="flex w-[13rem] shrink-0 flex-col gap-3 border-l border-edge bg-sunk p-3.5">
					<PanelHeader title="Notes" meta="3 new" />
					<GuidanceNote
						anchor="§3"
						confidence="confident"
						live
						title="You're restating §2"
						body="You're supposed to be moving into the human cost."
						actions={
							<>
								<Chip variant="outline" interactive>
									accept
								</Chip>
								<Chip variant="muted" interactive>
									decline
								</Chip>
							</>
						}
					/>
					<GuidanceNote
						anchor="whole piece"
						confidence="tentative"
						title="220 words over target"
						body="With §4 still to write, something in §3 has to give."
					/>

					<PanelHeader title="Accepted" meta="2" className="mt-1" />
					<ul className="flex flex-col gap-2">
						<li className="flex items-start gap-2">
							<Check />
							<span className="text-12 leading-snug text-ink">
								Cut the second crane-index callback
							</span>
						</li>
						<li className="flex items-start gap-2 opacity-55">
							<Check checked />
							<span className="text-12 leading-snug text-ink line-through">
								Attribute the £4,100 figure in-sentence
							</span>
						</li>
					</ul>

					<Button size="sm" variant="quiet" className="mt-auto self-start">
						hide notes
					</Button>
				</aside>
			</FrameBody>
		</Frame>
	)
}
