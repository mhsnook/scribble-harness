import type { ReactNode } from 'react'

import { cx } from '../lib/cx'
import { Chip } from './Chip'

export interface GuidanceNoteProps {
	/** Where it points: "§3", "§2 ↔ §4". */
	anchor?: string
	/** How sure the Guide is. `confident` notes are the ones surfaced on a pause. */
	confidence?: 'confident' | 'tentative'
	title: ReactNode
	body?: ReactNode
	/** Draws the note as the one thing asking for a decision. */
	live?: boolean
	accepted?: boolean
	actions?: ReactNode
	className?: string
}

/**
 * One Guidance note from the Guide. Notes never edit the prose — they say what
 * they see and wait. `live` is the freshly surfaced one and gets the accent
 * wash; every other note on screen stays quiet.
 */
export function GuidanceNote({
	anchor,
	confidence,
	title,
	body,
	live = false,
	accepted = false,
	actions,
	className,
}: GuidanceNoteProps) {
	return (
		<article
			className={cx(
				'flex flex-col gap-1.5 rounded-lg border p-2.5',
				live ? 'border-accent-edge bg-accent-soft' : 'border-edge bg-surface',
				accepted && 'opacity-60',
				className,
			)}
		>
			{anchor || confidence ? (
				<p className="label-meta">{[anchor, confidence].filter(Boolean).join(' · ')}</p>
			) : null}
			<h4 className="text-13 leading-snug font-semibold text-ink">{title}</h4>
			{body ? <p className="text-12 leading-relaxed text-muted">{body}</p> : null}
			{actions ? <div className="mt-0.5 flex flex-wrap gap-1.5">{actions}</div> : null}
			{accepted ? (
				<Chip variant="outline" className="self-start">
					accepted
				</Chip>
			) : null}
		</article>
	)
}

export interface NoteDotProps {
	count?: number
	className?: string
	onClick?: () => void
}

/**
 * The only thing that interrupts a blank writing surface: a small accent dot,
 * shown when you go idle and there is something worth reading. Clicking it
 * opens the notes Panel.
 */
export function NoteDot({ count, className, onClick }: NoteDotProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={count ? `${count} notes waiting` : 'Notes waiting'}
			className={cx(
				'inline-flex items-center gap-1.5 rounded-full border border-accent-edge bg-accent px-2 py-1 text-11 leading-none font-medium text-accent-ink',
				className,
			)}
		>
			<span aria-hidden className="size-1.5 rounded-full bg-accent-ink/70" />
			{count ? count : null}
		</button>
	)
}
