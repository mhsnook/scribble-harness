import type { ReactNode } from 'react'

import { cx } from '../lib/cx'

export interface LoadingProps {
	children: ReactNode
	className?: string
}

export function Loading({ children, className }: LoadingProps) {
	return (
		<p
			className={cx(
				'flex flex-auto items-center justify-center gap-2 p-6 text-12 text-faint',
				className,
			)}
		>
			<span aria-hidden className="size-1.5 animate-pulse rounded-full bg-faint" />
			{children}
		</p>
	)
}
