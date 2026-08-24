import type { ReactNode } from 'react'

import { cx } from '../lib/cx'

export interface NoticeProps {
	children: ReactNode
	className?: string
}

/** One sentence saying a thing did not land: a refused edit, a write the Article
 * Agent rejected, a composer that will not send. */
export function Notice({ children, className }: NoticeProps) {
	return (
		<p
			className={cx(
				'rounded-md border border-accent-edge bg-accent-soft p-2 text-12 text-accent-ink',
				className,
			)}
		>
			{children}
		</p>
	)
}
