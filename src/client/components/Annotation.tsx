import type { ReactNode } from 'react'

import { cx } from '../lib/cx'

export interface AnnotationProps {
	children: ReactNode
	align?: 'left' | 'right'
	className?: string
}

/**
 * A designer's note *about* a screen, drawn outside the window frame in the
 * documentation voice rather than the product voice — the same convention the
 * wireframes used. It explains intent; it is never part of the UI.
 */
export function Annotation({ children, align = 'left', className }: AnnotationProps) {
	return (
		<p
			className={cx(
				'flex max-w-[28rem] gap-2 pt-2.5 text-12 leading-relaxed text-muted',
				align === 'right' && 'ml-auto flex-row-reverse text-right',
				className,
			)}
		>
			<span aria-hidden className="shrink-0 text-faint">
				↑
			</span>
			<span>{children}</span>
		</p>
	)
}
