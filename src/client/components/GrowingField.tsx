import { type KeyboardEvent, useLayoutEffect, useRef } from 'react'

import { cx } from '../lib/cx'

/**
 * A textarea that grows with what is typed, up to eight lines, then scrolls.
 * The Chat composer and the Review composer both write into one.
 */

/** Height of the content, clamped by the field's own `max-h`. The `auto` is
 * load-bearing: `scrollHeight` reads back the height the field already has, so
 * without the reset the field could grow but never shrink.
 *
 * The composer's box is held across the reset, because `auto` collapses the
 * field to its one `rows` line and whatever is above it grows into the gap.
 * The browser clamps a grown scroller's `scrollTop` and does not restore it,
 * and both writes land in one block, so the ResizeObserver that re-pins the
 * transcript sees no net change and never fires. */
function grow(field: HTMLTextAreaElement) {
	const composer = field.closest<HTMLElement>('[data-composer]')
	if (composer !== null) composer.style.height = `${composer.offsetHeight}px`

	field.style.height = 'auto'
	field.style.height = `${field.scrollHeight}px`

	if (composer !== null) composer.style.height = ''
}

export interface GrowingFieldProps {
	label: string
	value: string
	onChange: (value: string) => void
	onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
	placeholder?: string
	disabled?: boolean
	className?: string
}

export function GrowingField({
	label,
	value,
	onChange,
	onKeyDown,
	placeholder,
	disabled = false,
	className,
}: GrowingFieldProps) {
	const field = useRef<HTMLTextAreaElement>(null)

	// An `onChange` would miss the first paint and the clear after sending.
	useLayoutEffect(() => {
		if (field.current !== null) grow(field.current)
	}, [value])

	// Eight lines, picked against `MidChatScreen`'s 26rem Chat Panel, where a
	// full-height field takes under half.
	return (
		<textarea
			ref={field}
			aria-label={label}
			className={cx(
				'max-h-[8lh] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent text-13 leading-relaxed text-ink outline-none placeholder:text-faint',
				className,
			)}
			disabled={disabled}
			onChange={(event) => onChange(event.target.value)}
			onKeyDown={onKeyDown}
			placeholder={placeholder}
			rows={1}
			value={value}
		/>
	)
}
