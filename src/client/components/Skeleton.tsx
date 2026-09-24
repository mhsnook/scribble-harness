import { cx } from '../lib/cx'

export interface SkeletonProps {
	/** What is being waited on, for a screen reader. */
	label?: string
	className?: string
}

/**
 * A bar standing where a value has not arrived yet. An empty title and a zero
 * count are real-looking answers, so a screen that has not got its value draws
 * this instead of drawing one.
 *
 * Height comes from the text around it. Give it a width, because a bar the
 * width of the value it waits for keeps the layout from jumping when the
 * value lands.
 */
export function Skeleton({ label, className }: SkeletonProps) {
	return (
		<span
			className={cx(
				'inline-block h-[1em] animate-pulse rounded-sm bg-hush align-middle',
				className,
			)}
		>
			<span className="sr-only">{label ?? 'Loading'}</span>
		</span>
	)
}
