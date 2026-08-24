import type { OutlineNode } from '../../shared/plan'
import { cx } from '../lib/cx'
import { Chip } from './Chip'

export interface OutlineRowProps {
	node: OutlineNode
	/** What the row is numbered: "2" for a Section, "2.1" for a Subsection. */
	ordinal: string
	/** Marks the Section being written; renders a quiet "now" flag. */
	current?: boolean
	/** Accent the word count — used when a Review has just changed it. */
	changed?: boolean
	/** Drop the chips and run as a single line. */
	dense?: boolean
	className?: string
}

/**
 * One row of the Outline, read-only: its number, its title, its target, and its
 * Tone. The editable row is `plan/SectionRow.tsx`.
 */
export function OutlineRow({
	node,
	ordinal,
	current = false,
	changed = false,
	dense = false,
	className,
}: OutlineRowProps) {
	const target = node.target === undefined ? null : `${node.target}w`

	return (
		<div className={cx('flex items-start gap-2.5', className)}>
			<span className="mt-px w-3 shrink-0 font-mono text-11 text-faint">{ordinal}</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-baseline gap-2">
					<span
						className={cx(
							'min-w-0 flex-1 text-13 leading-snug',
							current ? 'font-medium text-ink' : 'text-ink',
							dense && 'truncate',
						)}
					>
						{node.title}
					</span>
					{current ? <span className="shrink-0 text-11 text-faint">now</span> : null}
					{/* The count sits on the title line, where the eye can run down a
					    column of them rather than hunting each row for it. */}
					{target !== null ? (
						<Chip variant={changed ? 'accent' : 'default'}>{target}</Chip>
					) : null}
				</div>
				{!dense ? (
					<div className="flex flex-wrap gap-1.5 empty:hidden">
						{node.adjectives?.map((adjective) => (
							<Chip key={adjective} variant="outline">
								{adjective}
							</Chip>
						))}
						{node.voice ? <Chip variant="outline">voice: {node.voice}</Chip> : null}
					</div>
				) : null}
			</div>
		</div>
	)
}
