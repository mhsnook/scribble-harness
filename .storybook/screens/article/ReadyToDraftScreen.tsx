import { ArticleBar } from '../../../src/client/components/ArticleBar'
import { Button } from '../../../src/client/components/Button'
import { ChatComposer, ChatMessage } from '../../../src/client/components/Chat'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { Panel } from '../../../src/client/components/Panel'
import { ARTICLE_TITLE, plan } from '../../mock/content'
import { PlanBlock, PlanLength, PlanOutline } from './PlanBlocks'

/**
 * 2(c) — Scrolled to the end of the chat. "Start drafting" appears
 * once the plan has a length and at least one section. It is a nudge, not
 * a gate: the draft pill was available all along.
 */
export function ReadyToDraftScreen() {
	return (
		<Frame width={780}>
			<ArticleBar title={ARTICLE_TITLE} open={['chat', 'plan']} status="planning" />
			<FrameBody row className="h-[21rem]">
				<Panel divider="right" className="gap-3">
					<p className="text-center text-11 text-faint">↑ earlier in this chat</p>
					<ChatMessage from="guide">
						That gives §3 the human cost and keeps the numbers in §2 where they belong.
					</ChatMessage>
					<ChatMessage from="me">
						Good. Leave §4 short — I don't want to write a manifesto.
					</ChatMessage>
					<ChatMessage from="guide">
						Four sections, 2,400 words, thirteen references and eight quotes saved. Ready
						when you are.
					</ChatMessage>
					<ChatComposer />
				</Panel>

				<Panel variant="sunk" padded={false}>
					<div className="flex flex-1 flex-col gap-3.5 p-3.5">
						<PlanLength total={plan.totalTarget} />
						<PlanBlock title="Outline" meta="4 sections">
							<PlanOutline outline={plan.outline} dense />
						</PlanBlock>
						<p className="text-12 text-muted">13 references · 8 quotes</p>
					</div>
					<div className="flex items-center gap-3 border-t border-edge px-3.5 py-3">
						<Button variant="accent">start drafting →</Button>
						<span className="text-12 text-faint">or keep talking</span>
					</div>
				</Panel>
			</FrameBody>
		</Frame>
	)
}
