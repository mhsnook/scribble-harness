import { ArticleBar } from '../../../src/client/components/ArticleBar'
import { Button } from '../../../src/client/components/Button'
import {
	ChatComposer,
	ChatMessage,
	ChatReplies,
} from '../../../src/client/components/Chat'
import { Chip } from '../../../src/client/components/Chip'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { MetaLabel } from '../../../src/client/components/MetaLabel'
import { Panel, PanelHeader } from '../../../src/client/components/Panel'
import { ARTICLE_TITLE, outlineRevised } from '../../mock/content'
import { PlanOutline } from '../article/PlanBlocks'

/**
 * 4(c) — Notes sent to chat, and the plan gets revised. This is what closes
 * the loop: draft → review → accept → chat → the plan changes → draft again.
 * Counts are restated against the new plan, so "3 of 5 quotes used" becomes
 * "3 of 4" rather than staying a failure against a plan you have abandoned.
 */
export function NotesToChatScreen() {
	return (
		<Frame width={800}>
			<ArticleBar title={ARTICLE_TITLE} open={['chat', 'plan']} status="after review 2" />
			<FrameBody row className="h-[21rem]">
				<Panel divider="right" className="gap-3">
					<ChatMessage from="me">
						<MetaLabel className="mb-1.5">4 accepted notes, pasted in</MetaLabel>
						<ol className="flex list-decimal flex-col gap-1 pl-4">
							<li>The crane index carries §1 and §4 both — kill the second one.</li>
							<li>The human cost lands 600 words late.</li>
							<li>§3 drifts into Newsletter aside.</li>
							<li>Two planned quotes unused, both §3.</li>
						</ol>
					</ChatMessage>

					<ChatMessage from="guide">
						Notes 1 and 2 are the same problem: §3 is doing §4's job. If §3 loses the
						throughput quote and §4 absorbs the argument, the unused quotes stop being
						unused — one gets declined for good. Want me to redo the outline that way?
					</ChatMessage>

					<ChatReplies>
						<Chip variant="accent" interactive>
							yes, update the plan
						</Chip>
						<Chip variant="outline" interactive>
							leave it, I'll do it
						</Chip>
					</ChatReplies>

					<ChatComposer />
				</Panel>

				<Panel variant="sunk" padded={false}>
					<div className="flex flex-1 flex-col gap-3.5 p-3.5">
						<PanelHeader title="Plan" meta="revised just now" />
						<PlanOutline outline={outlineRevised} dense changedFrom={3} />

						<div className="flex flex-col gap-2">
							<MetaLabel>Quotes</MetaLabel>
							<div className="flex items-center gap-2.5">
								<Chip variant="accent">3 / 4</Chip>
								<span className="text-12 text-faint">was 3 / 5</span>
							</div>
							<div className="flex items-start gap-2.5 opacity-55">
								<span className="text-11 text-faint">dropped</span>
								<blockquote className="min-w-0 flex-1 border-l-2 border-rule pl-2.5 text-12 leading-relaxed text-muted">
									“The meter runs on an empty lot exactly as fast as it runs on a finished
									one.”
									<span className="mt-0.5 block text-11 text-faint">
										no longer needed in §3
									</span>
								</blockquote>
							</div>
						</div>
					</div>
					<div className="flex items-center gap-3 border-t border-edge px-3.5 py-3">
						<Button>back to the draft →</Button>
						<span className="text-12 text-faint">round 3 whenever</span>
					</div>
				</Panel>
			</FrameBody>
		</Frame>
	)
}
