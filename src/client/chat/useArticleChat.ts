import { useAgentChat } from '@cloudflare/ai-chat/react'
import type { UIMessage } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'

import { proposePlanChangeTool } from '../../shared/chat'
import type { Plan } from '../../shared/plan'
import { useArticle } from '../lib/article'
import type { ArticleSocket } from '../lib/useArticleAgent'
import { useOfferLedger, type OfferLedgerHandle } from '../lib/useOfferLedger'
import {
	afterRuling,
	type ProposalCall,
	type Refusals,
	ruleProposal,
	waitingCount,
} from './proposals'

/**
 * One Chat on the socket the Plan already holds — §6 and §8. A ruling applies
 * the ops through `edit` and then answers the tool call.
 *
 * Three SDK traps sit under this. `addToolResult` is deprecated in favour of
 * `addToolOutput`, and awaiting either deadlocks. A rejection is
 * `state: 'output-error'` with the reason in `errorText`. And
 * `addToolApprovalResponse` and `needsApproval` gate a server-side `execute`
 * this product does not have, so both rulings go out as tool output.
 */

export type ChatHandle = {
	messages: UIMessage[]
	/** A turn is in flight and the guide is the one working. True for a
	 * server-driven turn as well as the writer's own, and false while a Proposal
	 * is parked on the writer. */
	busy: boolean
	/** Cancels the turn, on the server as well as here. */
	stop: () => void
	/** Proposals nobody has ruled on; above zero the turn is parked — §11. */
	waiting: number
	refusals: Refusals
	ledger: OfferLedgerHandle
	send: (text: string) => void
	accept: (call: ProposalCall) => void
	decline: (call: ProposalCall) => void
	failure: string | null
}

export function useArticleChat(agent: ArticleSocket): ChatHandle {
	const { plan: connection } = useArticle()
	const ledger = useOfferLedger()
	const [refusals, setRefusals] = useState<Refusals>({})

	// A ref, because the body is built when the turn is sent rather than when
	// this renders. The Plan goes in `body` and not `metadata` — §6.
	const held = useRef<Plan | null>(connection.plan)
	useEffect(() => {
		held.current = connection.plan
	})

	const chat = useAgentChat({
		agent,
		body: () => (held.current === null ? {} : { plan: held.current }),
	})

	const { messages, addToolOutput } = chat

	const rule = (call: ProposalCall, accepted: boolean) => {
		const ruling = ruleProposal({
			call,
			accepted,
			edit: connection.edit,
			refusal: refusals[call.toolCallId] ?? null,
		})

		setRefusals((was) => afterRuling(was, call.toolCallId, ruling.refusal))
		if (ruling.answer === null) return

		// Awaiting this deadlocks.
		addToolOutput({
			toolCallId: call.toolCallId,
			toolName: proposePlanChangeTool,
			...('output' in ruling.answer
				? { output: ruling.answer.output }
				: { state: 'output-error' as const, errorText: ruling.answer.errorText }),
		})
	}

	const waiting = useMemo(() => waitingCount(messages), [messages])
	const running = chat.isStreaming || chat.isRecovering || chat.status === 'submitted'

	return {
		messages,
		// A turn sent over an unanswered call is refused server-side — §11.
		send: (text: string) => {
			const said = text.trim()
			if (said !== '' && waiting === 0) chat.sendMessage({ text: said })
		},
		accept: (call: ProposalCall) => rule(call, true),
		decline: (call: ProposalCall) => rule(call, false),

		// **A parked Proposal is not the guide answering.** A suspended call holds
		// the turn open, so the SDK reports it as streaming until the client
		// answers (§6) — but the writer is the one being waited on there, and the
		// Proposal card and the composer say so themselves.
		busy: running && waiting === 0,
		stop: () => void chat.stop(),
		waiting,
		refusals,
		ledger,
		failure: chat.error?.message ?? chat.connectionError?.message ?? null,
	}
}
