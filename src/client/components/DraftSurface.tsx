import type { CSSProperties, ReactNode } from 'react'

import { cx } from '../lib/cx'

export interface DraftSurfaceProps {
	paragraphs: string[]
	/** Index of the paragraph a note is anchored to; gets a quiet left rule. */
	anchoredIndex?: number
	/** Show a caret after the last paragraph. */
	caret?: boolean
	/** Horizontal breathing room. `wide` is the draft-alone measure. */
	measure?: 'wide' | 'narrow'
	dimmed?: boolean
	children?: ReactNode
	className?: string
	style?: CSSProperties
}

/**
 * The writing surface. Serif, generously leaded, nothing else on it — the
 * human is the only one who writes here, so the app puts nothing in the way.
 */
export function DraftSurface({
	paragraphs,
	anchoredIndex,
	caret = false,
	measure = 'wide',
	dimmed = false,
	children,
	className,
	style,
}: DraftSurfaceProps) {
	return (
		<div
			className={cx(
				'prose-draft flex min-w-0 flex-1 flex-col bg-surface py-5',
				measure === 'wide' ? 'px-10' : 'px-6',
				dimmed && 'opacity-45',
				className,
			)}
			style={style}
		>
			{paragraphs.map((text, i) => (
				<p
					key={i}
					className={cx(
						'text-15',
						i > 0 && 'mt-4',
						i === anchoredIndex && '-ml-3 border-l-2 border-accent-edge pl-3',
					)}
				>
					{text}
					{caret && i === paragraphs.length - 1 ? (
						<span
							aria-hidden
							className="ml-0.5 inline-block h-[1em] w-px translate-y-[0.15em] bg-ink"
						/>
					) : null}
				</p>
			))}
			{children}
		</div>
	)
}
