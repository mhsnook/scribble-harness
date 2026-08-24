import { cx } from '../lib/cx'

export interface ExampleBlockProps {
	/** `yes` is what the rule should score highly; `no` is what it must reject. */
	polarity: 'yes' | 'no'
	text: string
	/** Where the example came from: an article title, or "pasted". */
	source?: string
	/** Why it is on the wrong side — only ever shown on `no` examples. */
	reason?: string
	className?: string
}

/**
 * A worked example under a voice or an adjective. Positive examples get a
 * solid edge; negative ones are dashed, because "not this" is the absence of
 * the rule rather than a rule of its own.
 */
export function ExampleBlock({
	polarity,
	text,
	source,
	reason,
	className,
}: ExampleBlockProps) {
	const yes = polarity === 'yes'
	return (
		<figure
			className={cx(
				'flex flex-col gap-1.5 rounded-md border p-2.5',
				yes ? 'border-edge bg-surface' : 'border-dashed border-edge bg-sunk',
				className,
			)}
		>
			<blockquote className="text-12 leading-relaxed text-ink">“{text}”</blockquote>
			<figcaption className="flex flex-wrap items-center gap-x-1.5 text-11 text-faint">
				{source ? <cite className="not-italic">{source}</cite> : null}
				{source && reason ? <span aria-hidden>·</span> : null}
				{reason ? <span>{reason}</span> : null}
			</figcaption>
		</figure>
	)
}

export interface PolarityHeadingProps {
	polarity: 'yes' | 'no'
	children: React.ReactNode
	count?: number
}

/** "SOUNDS LIKE THIS · 3" / "NOT THIS · 2", with the dot that marks polarity. */
export function PolarityHeading({ polarity, children, count }: PolarityHeadingProps) {
	return (
		<div className="flex items-center gap-2">
			<span
				aria-hidden
				className={cx(
					'size-2.5 shrink-0 rounded-full border',
					polarity === 'yes'
						? 'border-accent-edge bg-accent'
						: 'border-edge bg-transparent',
				)}
			/>
			<span className="label-meta">
				{children}
				{count !== undefined ? <span> · {count}</span> : null}
			</span>
		</div>
	)
}
