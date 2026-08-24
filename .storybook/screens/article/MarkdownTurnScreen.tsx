import { ChatPanel } from '../../../src/client/chat/ChatPanel'
import { ArticleBar } from '../../../src/client/components/ArticleBar'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { useMockPlan } from '../../mock/MockArticle'
import { useMockChat } from '../../mock/MockChat'
import { markdownTurn } from '../../mock/transcript'

/** 2(b·ii) — A guide turn written in markdown, Chat Panel at full width. The
 * writer's message above it holds asterisks of its own and keeps them. */
export function MarkdownTurnScreen() {
	const plan = useMockPlan()
	const { ledger: _ledger, ...chat } = useMockChat(markdownTurn)

	return (
		<Frame width={700}>
			<ArticleBar title={plan.title} open={['chat']} status="research" />
			<FrameBody className="h-[30rem]">
				<ChatPanel
					{...chat}
					placeholder="Which of these has a piece in it…"
					plan={plan}
				/>
			</FrameBody>
		</Frame>
	)
}
