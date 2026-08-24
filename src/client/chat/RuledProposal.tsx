import type { Plan } from '../../shared/plan'
import { cx } from '../lib/cx'
import { changeCount, ProposalChanges } from './ProposalChanges'
import { describeProposal, type ProposalCall } from './proposals'

/**
 * A Proposal the writer has already ruled on — §6. Shut, it is the one-line note
 * the transcript used to carry; open, it prints the same sentences the card
 * offered, so the writer can read back what they Accepted.
 *
 * The sentences are named out of the Plan **as it stands now**. The transcript
 * keeps the ops and nothing keeps the Plan they were written against, so an
 * Accepted delete names a Section the Plan no longer carries.
 */

export interface RuledProposalProps {
	call: ProposalCall
	/** What the changes name their Sections and References out of. */
	plan: Plan
	ruling: 'accepted' | 'declined'
	className?: string
}

export function RuledProposal({ call, plan, ruling, className }: RuledProposalProps) {
	const changes = call.ops === null ? [] : describeProposal(plan, call.ops)
	const ruled = ruling === 'accepted' ? 'Proposal Accepted' : 'Proposal Declined'

	return (
		<details className={cx('text-11 text-faint', className)}>
			<summary className="cursor-pointer">
				{call.ops === null ? `${ruled}.` : `${ruled} · ${changeCount(changes)}`}
			</summary>

			<ProposalChanges
				changes={changes}
				className="mt-1.5 border-l border-rule pl-2.5"
				unreadable={call.unreadable}
			/>
		</details>
	)
}
