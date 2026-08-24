import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

import { cx } from '../lib/cx'

export type ButtonVariant = 'default' | 'accent' | 'quiet' | 'link'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	'children'
> {
	/**
	 * `accent` is the rose one. A screen should have at most one — it marks
	 * the single thing the app wants you to do next.
	 */
	variant?: ButtonVariant
	size?: ButtonSize
	/** "You are here" — the chosen one of a set. State rather than a call to
	 * action, so it takes `green` rather than the accent, the way a solid Chip
	 * does. */
	pressed?: boolean
	/** For a caller that puts focus back on this Button after closing what it
	 * opened. */
	ref?: Ref<HTMLButtonElement>
	children?: ReactNode
}

// `pressed` replaces the variant rather than layering over it. Two utilities
// setting the same property resolve by their order in the stylesheet, not by
// the order they are written in, so `bg-green` next to `bg-surface` is a coin
// toss — and it landed on green fill with ink text.
const pressedClass = 'border border-green bg-green text-green-ink hover:brightness-125'

const variantClass: Record<ButtonVariant, string> = {
	default: 'border border-edge bg-surface text-ink hover:border-ink/40 hover:bg-hush',
	accent: 'border border-accent-edge bg-accent text-accent-ink hover:brightness-[0.97]',
	quiet:
		'border border-transparent bg-transparent text-muted hover:border-edge hover:text-ink',
	link: 'border-0 bg-transparent p-0 text-muted underline decoration-edge underline-offset-[3px] hover:text-ink hover:decoration-ink/40',
}

const sizeClass: Record<ButtonSize, string> = {
	sm: 'h-6 gap-1.5 rounded-full px-2.5 text-12',
	md: 'h-8 gap-2 rounded-full px-3.5 text-13',
}

/** The look on its own, for a `Link` that has to sit in a row of Buttons. A
 * control that navigates is an anchor, and only the styling is shared. */
export function buttonClass({
	variant = 'default',
	size = 'md',
	pressed,
	className,
}: Pick<ButtonProps, 'variant' | 'size' | 'pressed' | 'className'> = {}): string {
	return cx(
		'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background-color,border-color,color,filter] disabled:pointer-events-none disabled:opacity-40',
		variant === 'link' ? 'h-auto text-13' : sizeClass[size],
		pressed ? pressedClass : variantClass[variant],
		className,
	)
}

export function Button({
	variant = 'default',
	size = 'md',
	pressed,
	ref,
	className,
	children,
	type = 'button',
	...rest
}: ButtonProps) {
	return (
		<button
			ref={ref}
			type={type}
			aria-pressed={pressed}
			className={buttonClass({ variant, size, pressed, className })}
			{...rest}
		>
			{children}
		</button>
	)
}

export interface ButtonGroupProps {
	/** Names the set for a screen reader: "Where the Section goes". */
	label: string
	children: ReactNode
	className?: string
}

/**
 * Buttons that belong together, joined into one control. Two related choices
 * read as one decision this way, where two loose pills read as two.
 */
export function ButtonGroup({ label, children, className }: ButtonGroupProps) {
	return (
		<div
			aria-label={label}
			className={cx(
				'inline-flex [&>*]:rounded-none [&>*+*]:-ml-px [&>*:first-child]:rounded-l-full [&>*:last-child]:rounded-r-full',
				className,
			)}
			role="group"
		>
			{children}
		</div>
	)
}
