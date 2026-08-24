import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cx } from '../lib/cx'

export type ChipVariant = 'default' | 'accent' | 'outline' | 'muted' | 'solid'

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLElement>, 'children'> {
	variant?: ChipVariant
	/** Renders as a button. Off by default — most chips are labels. */
	interactive?: boolean
	/** Dims the chip without changing its variant (unresolved, declined, not-yet). */
	dimmed?: boolean
	children?: ReactNode
}

const variantClass: Record<ChipVariant, string> = {
	default: 'border-edge bg-hush text-muted',
	accent: 'border-accent-edge bg-accent text-accent-ink',
	outline: 'border-edge bg-transparent text-muted',
	muted: 'border-transparent bg-transparent text-faint',
	// `solid` is "you are here" — a tab or filter that is currently selected.
	// State, not a call to action, so it takes `green` rather than the accent.
	solid: 'border-green bg-green text-green-ink',
}

/** The pill's own geometry, exported for a control that cannot be a `Chip` —
 * the status `<select>` in the ArticleBar sits beside real ones. */
export function chipClass(variant: ChipVariant, interactive = false): string {
	return cx(
		'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-[0.1875rem] text-11 leading-none font-medium whitespace-nowrap',
		variantClass[variant],
		interactive && 'transition-colors hover:border-ink/30 hover:text-ink',
	)
}

/**
 * A small metadata token: word targets, adjectives, voices, statuses, filters.
 * Chips are read-only labels unless `interactive` is set.
 */
export function Chip({
	variant = 'default',
	interactive = false,
	dimmed = false,
	className,
	children,
	...rest
}: ChipProps) {
	const Tag = (interactive ? 'button' : 'span') as 'button'
	return (
		<Tag
			{...(interactive ? { type: 'button' as const } : {})}
			className={cx(chipClass(variant, interactive), dimmed && 'opacity-45', className)}
			{...rest}
		>
			{children}
		</Tag>
	)
}
