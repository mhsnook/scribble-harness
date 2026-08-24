import { Chip } from '../../../src/client/components/Chip'
import { ProgressBar } from '../../../src/client/components/ProgressBar'
import { cx } from '../../../src/client/lib/cx'
import type { OutlineNode } from '../../../src/shared/plan'

export interface PlanRailProps {
	outline: readonly OutlineNode[]
	/** Written words per Section, in the same order. */
	written: number[]
	/** The Section being written. */
	currentId?: string
	/** Chips at the foot of the rail: references, quotes, notes. */
	counts?: string[]
	className?: string
}

/**
 * The Plan collapsed to a rail beside the Draft. Section titles, one quiet bar
 * each, and a whole-piece bar at the bottom — the secondary user wants a sense
 * of completion without a number that twitches on every keystroke.
 */
export function PlanRail({
	outline,
	written,
	currentId,
	counts,
	className,
}: PlanRailProps) {
	const target = outline.reduce((sum, node) => sum + (node.target ?? 0), 0)
	const done = written.reduce((sum, count) => sum + count, 0)

	// A Section with no target has no share of the piece to be part-way through,
	// so its bar sits empty rather than dividing by nothing.
	const share = (words: number, of: number | undefined) =>
		of === undefined || of === 0 ? 0 : words / of

	return (
		<aside
			className={cx(
				'flex w-[11rem] shrink-0 flex-col gap-3.5 border-r border-edge bg-sunk p-3.5',
				className,
			)}
		>
			{outline.map((node, i) => {
				const current = node.id === currentId
				const part = share(written[i], node.target)
				return (
					<div key={node.id} className="flex flex-col gap-1.5">
						<div className="flex items-baseline gap-1.5">
							<p
								className={cx(
									'min-w-0 flex-1 text-12 leading-snug',
									current ? 'font-medium text-ink' : 'text-muted',
								)}
							>
								{node.title}
							</p>
							{current ? <span className="text-10 text-faint">now</span> : null}
						</div>
						<ProgressBar
							value={part}
							label={`${node.title} progress`}
							variant={part > 1 ? 'attention' : 'quiet'}
						/>
					</div>
				)
			})}

			<div className="mt-auto flex flex-col gap-1.5">
				<ProgressBar value={share(done, target)} thickness={5} label="Whole piece" />
				<p className="text-11 text-faint">whole piece</p>
			</div>

			{counts?.length ? (
				<div className="flex flex-wrap gap-1.5">
					{counts.map((count) => (
						<Chip key={count} variant="outline">
							{count}
						</Chip>
					))}
				</div>
			) : null}
		</aside>
	)
}
