import type { ReactNode } from 'react'

import { cx } from '../lib/cx'

export interface ListRowProps {
	title: ReactNode
	note?: ReactNode
	/** Right-hand columns, rendered in order. */
	trailing?: ReactNode
	dimmed?: boolean
	className?: string
}

/** One line of the long tail: older drafts, published pieces, table rows. */
export function ListRow({
	title,
	note,
	trailing,
	dimmed = false,
	className,
}: ListRowProps) {
	return (
		<div
			className={cx(
				'flex items-baseline gap-3 border-b border-rule py-2 last:border-b-0',
				dimmed && 'opacity-60',
				className,
			)}
		>
			<span className="min-w-0 truncate text-13 text-ink">{title}</span>
			{note ? <span className="min-w-0 truncate text-12 text-faint">{note}</span> : null}
			<span className="ml-auto flex shrink-0 items-baseline gap-3">{trailing}</span>
		</div>
	)
}
