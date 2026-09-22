import type { CSSProperties, ReactNode } from 'react'

import { cx } from '../lib/cx'

export interface FrameProps {
	/** Width of the app window. Numbers are px. */
	width?: number | string
	/** Minimum height of the body area below the title bar. Numbers are px. */
	minHeight?: number | string
	children?: ReactNode
	className?: string
	style?: CSSProperties
}

/**
 * The app window. Every screen sits inside one of these: it draws the outer
 * border, the single elevation used in the whole system, and clips its
 * children so Panels can run edge to edge.
 */
export function Frame({
	width = 720,
	minHeight,
	children,
	className,
	style,
}: FrameProps) {
	return (
		<div
			// The browser test finds every Frame by this attribute rather than by a
			// class, so renaming a Tailwind class cannot quietly empty the test.
			data-frame=""
			className={cx(
				'flex flex-col overflow-hidden rounded-frame border border-edge bg-surface text-ink shadow-frame',
				className,
			)}
			style={{ width, minHeight, ...style }}
		>
			{children}
		</div>
	)
}

export interface FrameBodyProps {
	children?: ReactNode
	/** Lay the children out as horizontal Panels rather than stacked blocks. */
	row?: boolean
	className?: string
	style?: CSSProperties
}

export interface ScreenProps {
	children?: ReactNode
	className?: string
}

/**
 * The app filling the window, which is what a route renders. {@link Frame} is
 * the showcase's fixed-width stand-in for it, so the two are separate on
 * purpose: a screen inside a story is bounded, and a screen in the app is not.
 */
export function Screen({ children, className }: ScreenProps) {
	return (
		<div className={cx('flex h-dvh flex-col bg-paper text-ink', className)}>
			{children}
		</div>
	)
}

/** The area under the title bar. `row` turns it into the horizontal Panel rail. */
export function FrameBody({ children, row = false, className, style }: FrameBodyProps) {
	return (
		<div
			data-frame-body=""
			// `flex-auto` rather than `flex-1`, because a basis of 0 would override
			// the height a screen sets here, and that height is what the Panels
			// scroll within.
			className={cx('flex min-h-0 flex-auto', row ? 'flex-row' : 'flex-col', className)}
			style={style}
		>
			{children}
		</div>
	)
}
