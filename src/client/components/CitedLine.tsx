import type { ReactNode } from 'react'

import { cx } from '../lib/cx'

export interface CitedLineProps {
	/** Author, publication, year, url — whichever the caller has to show. */
	parts: ReactNode[]
	className?: string
}

/**
 * Citation formats are the writer's and vary by Article, so this renders the
 * parts as given, in a wrapper, separated in a way that copy-pastes well.
 * Draws nothing when there are no parts.
 */
export function CitedLine({ parts, className }: CitedLineProps) {
	if (parts.length === 0) return null

	return (
		<p
			className={cx(
				'flex flex-wrap items-center gap-x-1.5 text-11 text-faint',
				className,
			)}
		>
			{parts.map((part, index) => (
				// Positional and fixed within a render, so the index is a stable key.
				<span className="min-w-0" key={index}>
					{index > 0 ? <span aria-hidden>· </span> : null}
					{part}
				</span>
			))}
		</p>
	)
}
