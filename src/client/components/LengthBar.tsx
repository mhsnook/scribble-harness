import { cx } from '../lib/cx'

export interface LengthSegment {
	label?: string
	words: number
	/** `done` is drafted, `current` is where the cursor is, `planned` is ahead. */
	state?: 'done' | 'current' | 'planned'
}

export interface LengthBarProps {
	segments: LengthSegment[]
	height?: number
	/** Show each segment's word count down the right-hand side. */
	showCounts?: boolean
	/**
	 * Accent the `current` segment. Only turn this on when the screen has no
	 * other accented element.
	 */
	accentCurrent?: boolean
	className?: string
}

/**
 * The plan's shape, as a proportional vertical bar: each section's height is
 * its share of the target word count. It sits alongside the outline rather
 * than aligning to it — it reads the whole piece at a glance.
 */
export function LengthBar({
	segments,
	height = 160,
	showCounts = true,
	accentCurrent = false,
	className,
}: LengthBarProps) {
	return (
		<div className={cx('flex items-stretch gap-2', className)} style={{ height }}>
			<div className="flex w-3.5 flex-col overflow-hidden rounded-[0.25rem] border border-edge">
				{segments.map((segment, i) => {
					const state = segment.state ?? 'planned'
					return (
						<div
							key={i}
							style={{ flex: segment.words }}
							title={`${segment.label ?? `Section ${i + 1}`} — ${segment.words.toLocaleString()} words`}
							className={cx(
								i > 0 && 'border-t border-edge',
								state === 'done' && 'bg-ink/25',
								state === 'current' && (accentCurrent ? 'bg-accent' : 'bg-ink/12'),
								state === 'planned' && 'bg-sunk',
							)}
						/>
					)
				})}
			</div>
			{showCounts ? (
				<div className="flex flex-col justify-between py-px">
					{segments.map((segment, i) => (
						<span
							key={i}
							className="font-mono text-11 leading-none text-faint"
							style={{ flex: segment.words, display: 'flex', alignItems: 'center' }}
						>
							{segment.words.toLocaleString()}
						</span>
					))}
				</div>
			) : null}
		</div>
	)
}
