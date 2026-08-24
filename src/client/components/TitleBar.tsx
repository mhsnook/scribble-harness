import { Link } from '@tanstack/react-router'
import type { ComponentProps, ReactNode } from 'react'

import { cx } from '../lib/cx'

export interface TitleBarProps {
	/** The back affordance, named — a `BackLink` where it goes somewhere. */
	back?: ReactNode
	title: ReactNode
	/** Quiet text after the title — "· board", "· all articles". */
	subtitle?: ReactNode
	/** Right-hand side: buttons, Panel pills, filters. */
	actions?: ReactNode
	className?: string
}

/**
 * The window's title bar. Back on the left, then the title, with actions
 * pushed right. The rule underneath is the heavier of the two hairline
 * weights — it separates chrome from content.
 */
export function TitleBar({ back, title, subtitle, actions, className }: TitleBarProps) {
	return (
		<header
			className={cx(
				'flex shrink-0 items-center gap-2.5 border-b border-edge bg-sage px-4 py-2.5',
				className,
			)}
		>
			{back}
			<h2 className="truncate text-15 leading-tight font-medium text-ink">{title}</h2>
			{subtitle ? <span className="truncate text-13 text-faint">{subtitle}</span> : null}
			<div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
		</header>
	)
}

const backClass =
	'-ml-1 flex shrink-0 items-center gap-1.5 rounded px-1 py-0.5 text-13 text-muted transition-colors hover:text-ink'

function BackArrow({ children }: { children: ReactNode }) {
	return (
		<>
			<span aria-hidden className="text-[0.9em] leading-none">
				←
			</span>
			<span className="max-w-[16rem] truncate">{children}</span>
		</>
	)
}

/**
 * Going back to somewhere the app has a route for. A real anchor, so it opens in
 * a new tab on a middle-click and warms its route on hover like every other
 * `Link`.
 */
export function BackLink({
	children,
	...rest
}: Omit<ComponentProps<typeof Link>, 'children' | 'className'> & {
	children: ReactNode
}) {
	return (
		<Link className={backClass} {...rest}>
			<BackArrow>{children}</BackArrow>
		</Link>
	)
}

/** Going back to somewhere that is not a route — closing a still frame, or a
 * screen the app does not have a path for yet. */
export function BackButton({
	children,
	onBack,
}: {
	children: ReactNode
	onBack?: () => void
}) {
	return (
		<button className={backClass} onClick={onBack} type="button">
			<BackArrow>{children}</BackArrow>
		</button>
	)
}
