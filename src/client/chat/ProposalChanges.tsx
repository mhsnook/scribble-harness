import { cx } from '../lib/cx'
import { unreadableText } from '../plan/refusalText'

/** The ops of one Proposal as sentences: what the open card offers, and what a
 * ruled Proposal folds away behind its note. */

export interface ProposalChangesProps {
	/** One sentence per op, out of `describeProposal`. */
	changes: readonly string[]
	/** Why the ops could not be read, and null where they could — §6. */
	unreadable?: string | null
	className?: string
}

export function ProposalChanges({
	changes,
	unreadable = null,
	className,
}: ProposalChangesProps) {
	if (unreadable !== null) {
		return (
			<p className={cx('text-13 leading-snug text-ink', className)}>{unreadableText}</p>
		)
	}

	return (
		<ul className={cx('flex list-none flex-col gap-1', className)}>
			{changes.map((change) => (
				<li key={change} className="text-13 leading-snug text-ink">
					{change}
				</li>
			))}
		</ul>
	)
}

/** How many changes a Proposal carries, for a heading or a summary. */
export function changeCount(changes: readonly string[]): string {
	return changes.length === 1 ? '1 change' : `${changes.length} changes`
}
