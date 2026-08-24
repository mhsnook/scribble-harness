import { ListTodo } from 'lucide-react'
import { useRef, useState, type RefObject } from 'react'

import { Button } from '../components/Button'
import { Panel } from '../components/Panel'
import { useArticle } from '../lib/article'
import type { ArticleSocket } from '../lib/useArticleAgent'
import { ChatPanel, type ChatPanelProps } from './ChatPanel'
import { OfferLedgerDrawer } from './OfferLedgerDrawer'
import { useArticleChat } from './useArticleChat'

/** Drives `ChatPanel` from one Article Agent. Takes the socket rather than
 * opening one — §8. */

export interface ArticleChatPanelProps {
	agent: ArticleSocket
	placeholder?: string
	divider?: ChatPanelProps['divider']
	/** This Panel's share of the Panel row — `panelShare`. */
	grow?: ChatPanelProps['grow']
	className?: string
}

export function ArticleChatPanel({
	agent,
	placeholder,
	divider,
	grow,
	className,
}: ArticleChatPanelProps) {
	const { plan } = useArticle().plan
	const chat = useArticleChat(agent)
	const { ledger } = chat
	const [showLedger, setShowLedger] = useState(false)
	const toggle = useRef<HTMLButtonElement>(null)

	// A Proposal card names Sections out of the Plan, so there is nothing to draw
	// until one arrives.
	if (plan === null) {
		return (
			<Panel className={className} divider={divider} grow={grow}>
				<p className="text-12 text-faint">Opening the Chat…</p>
			</Panel>
		)
	}

	const close = () => {
		setShowLedger(false)
		toggle.current?.focus()
	}

	return (
		<ChatPanel
			busy={chat.busy}
			className={className}
			divider={divider}
			drawer={<OfferLedgerDrawer ledger={ledger} onClose={close} open={showLedger} />}
			failure={chat.failure ?? ledger.failure}
			grow={grow}
			leading={
				<LedgerToggle
					onToggle={() => (showLedger ? close() : setShowLedger(true))}
					open={showLedger}
					ref={toggle}
					undecided={ledger.ledger.counts.undecided}
				/>
			}
			messages={chat.messages}
			offers={ledger.ledger.offers}
			onAccept={chat.accept}
			onAcceptOffer={ledger.accept}
			onDecline={chat.decline}
			onDeclineOffer={ledger.decline}
			onSend={chat.send}
			onStop={chat.stop}
			placeholder={placeholder}
			plan={plan}
			refusals={chat.refusals}
			waiting={chat.waiting}
		/>
	)
}

/** Opens and closes the Offer ledger. Sits left of the composer, which the
 * drawer leaves uncovered, so it is in one place for both. */
function LedgerToggle({
	onToggle,
	open,
	ref,
	undecided,
}: {
	onToggle: () => void
	open: boolean
	ref: RefObject<HTMLButtonElement | null>
	undecided: number
}) {
	return (
		<Button
			aria-expanded={open}
			aria-label={
				undecided === 0
					? 'Offer ledger'
					: `Offer ledger, ${undecided} Offers still Undecided`
			}
			onClick={onToggle}
			pressed={open}
			ref={ref}
			size="sm"
			variant="quiet"
		>
			<ListTodo aria-hidden className="size-3.5" />
			{undecided === 0 ? null : undecided}
		</Button>
	)
}
