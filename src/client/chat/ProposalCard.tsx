import type { Plan, Refusal } from '../../shared/plan'
import { Button } from '../components/Button'
import { Notice } from '../components/Notice'
import { cx } from '../lib/cx'
import { refusalText } from '../plan/refusalText'
import { changeCount, ProposalChanges } from './ProposalChanges'
import { describeProposal, type ProposalCall } from './proposals'

/** One suspended Proposal to Accept or Decline — `docs/chat.md`. Renders its ops as
 * sentences, and the refusal if an Accept was turned down. */

export interface ProposalCardProps {
	call: ProposalCall
	plan: Plan
	refusal?: Refusal | null
	onAccept: () => void
	onDecline: () => void
	className?: string
}

export function ProposalCard({
	call,
	plan,
	refusal = null,
	onAccept,
	onDecline,
	className,
}: ProposalCardProps) {
	const changes = call.ops === null ? [] : describeProposal(plan, call.ops)

	return (
		<article
			className={cx(
				'flex flex-col gap-2 rounded-lg border border-accent-edge bg-surface p-2.5',
				className,
			)}
		>
			<h4 className="label-meta text-muted">Proposal · {changeCount(changes)}</h4>

			<ProposalChanges changes={changes} unreadable={call.unreadable} />

			{refusal === null ? null : (
				<Notice>
					{refusalText(plan, refusal)} Decline to send that back, or edit the Plan and
					Accept again.
				</Notice>
			)}

			<div className="flex items-center gap-1.5">
				<Button size="sm" disabled={call.ops === null} onClick={onAccept}>
					accept
				</Button>
				<Button size="sm" variant="quiet" onClick={onDecline}>
					decline
				</Button>
			</div>
		</article>
	)
}
