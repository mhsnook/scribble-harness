import type { Reference } from '../../shared/plan'
import { cx } from '../lib/cx'
import { citation, referenceName } from '../plan/references'
import { Chip } from './Chip'

export interface QuoteRowProps {
	reference: Reference
	/** An em dash where the caller passes none. */
	section?: string
	/** Unused till phase 2. */
	used?: boolean
	showUsage?: boolean
	dimmed?: boolean
	className?: string
}

/**
 * One placed Reference, with what it is doing in the Draft.
 *
 * **Unused** — the Primitives story is the only caller. It was added for a
 * read-only summary of the Plan Panel, which we stopped using and may go back
 * to at phase 2, where `used` against `ready` becomes a real distinction.
 */
export function QuoteRow({
	reference,
	section,
	used = false,
	showUsage = false,
	dimmed = false,
	className,
}: QuoteRowProps) {
	// Empty where the heading already said the whole record — a Quote carrying
	// no source, or a Link with nothing but a url.
	const cite = citation(reference)

	return (
		<div className={cx('flex items-start gap-2.5', dimmed && 'opacity-50', className)}>
			<Chip variant={section ? 'default' : 'muted'} className="mt-px">
				{section ?? '—'}
			</Chip>
			<blockquote
				className={cx(
					'min-w-0 flex-1 border-l-2 pl-2.5',
					used ? 'border-accent-edge' : 'border-rule',
				)}
			>
				<p className="text-13 leading-relaxed text-ink">{referenceName(reference)}</p>
				{cite === '' && !showUsage ? null : (
					<footer className="mt-1 flex items-center gap-2 text-11 text-faint">
						{cite === '' ? null : <cite className="not-italic">{cite}</cite>}
						{showUsage ? (
							<span className={used ? 'text-accent-ink' : undefined}>
								{cite === '' ? null : <span aria-hidden>· </span>}
								{used ? 'used' : 'ready'}
							</span>
						) : null}
					</footer>
				)}
			</blockquote>
		</div>
	)
}
