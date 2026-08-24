import type { ReactNode } from 'react'

import { cx } from '../lib/cx'
import { PanelRail, type PanelId } from './PanelRail'
import { Skeleton } from './Skeleton'

export interface ArticleBarProps {
	/** The back affordance, named — a `BackLink` where it goes somewhere. */
	back?: ReactNode
	/** `null` while it is still being read, which draws a bar rather than an
	 * empty string. `displayTitle('')` is the untitled placeholder, so an absent
	 * title and a cleared one must not share a value here. */
	title: string | null
	/** Right-hand status: "draft 1", "round 2", "§3 of 4", or the controls that
	 * set one. */
	status?: ReactNode
	open: readonly PanelId[]
	onToggle?: (Panel: PanelId) => void
	/** Put the rail on a row of its own — beside the title and the status there
	 * is nowhere near the width for four pills. */
	stacked?: boolean
	/** Draw the rule underneath. Off when the Panel below carries its own edge. */
	divided?: boolean
	className?: string
}

/**
 * The article window's own bar. It takes the same sage as {@link TitleBar}, so
 * the chrome reads as one band across every screen, but the type inside it is
 * quieter: it sits above a writing surface, so title and status recede and the
 * Panel rail is the only thing with any weight.
 */
export function ArticleBar({
	back,
	title,
	status,
	open,
	onToggle,
	stacked = false,
	divided = true,
	className,
}: ArticleBarProps) {
	const rail = <PanelRail onToggle={onToggle} open={open} />

	return (
		<header
			className={cx(
				'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 bg-sage px-3 py-2',
				divided && 'border-b border-rule',
				className,
			)}
		>
			{back}
			<span className="min-w-0 flex-1 truncate text-13 text-faint">
				{title === null ? (
					<Skeleton className="w-40" label="Opening the Article" />
				) : (
					title
				)}
			</span>
			{stacked ? null : rail}
			<span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right text-12 whitespace-nowrap text-faint">
				{status}
			</span>
			{stacked ? (
				<PanelRail className="w-full justify-center" onToggle={onToggle} open={open} />
			) : null}
		</header>
	)
}
